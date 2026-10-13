#!/usr/bin/env python3
"""Install the reference worker on the existing VPS; never submit a paid job.

Run as root after deploying this release and taking a verified DB/media backup.
Keeps existing credentials and snapshots production.env for recovery.
"""
import datetime
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import urllib.request

if os.geteuid() != 0:
    raise SystemExit("Run as root on the VPS")
root = Path("/opt/oblikos/current").resolve(strict=True)
if not str(root).startswith("/opt/oblikos/releases/"):
    raise SystemExit("Unexpected release path")
env_path = Path("/etc/oblikos/production.env")
unit_path = Path("/etc/systemd/system/oblikos-video-worker.service")
if env_path.is_symlink() or unit_path.is_symlink():
    raise SystemExit("Expected regular configuration files")
exec_start = subprocess.check_output(["systemctl", "show", "oblikos", "--property=ExecStart", "--value"], text=True)
match = re.search(r"path=([^ ;]+)", exec_start)
if not match or not Path(match[1]).is_file() or " " in match[1]:
    raise SystemExit("Cannot locate service Node")
node = match[1]
if subprocess.check_output([node, "-p", 'process.versions.node.split(".")[0]'], text=True).strip() != "24":
    raise SystemExit("Node 24 required")
for prop in ("User", "Group"):
    if subprocess.check_output(["systemctl", "show", "oblikos", f"--property={prop}", "--value"], text=True).strip() != "oblikos":
        raise SystemExit("Review service identity before installing worker")
with urllib.request.urlopen("https://api.aitunnel.ru/public/aitunnel/models/videos", timeout=20) as response:
    catalog = json.load(response)
parser = argparse.ArgumentParser()
parser.add_argument("--model", choices=["hailuo-3", "seedance-2.0-mini"], default="hailuo-3")
model = parser.parse_args().model
mini = model == "seedance-2.0-mini"
motion = catalog[model]
sizes = ["720x1280", "1280x720", "720x720"] if mini else ["1440x2560", "2560x1440", "1440x1440"]
if not motion.get("supports_input_references") or not {"video", "image"}.issubset(motion["modalities"]["input"]) or not set(range(4 if mini else 5, 16)).issubset(motion["supported_durations"]) or not set(sizes).issubset(motion["supported_sizes"]):
    raise SystemExit("Model capabilities changed; review adapter")
rates = [float(motion["size_prices"][size]) for size in sizes]
if rates[0] != rates[1] or (not mini and len(set(rates)) != 1) or not all(0 < rate <= 10000 for rate in rates):
    raise SystemExit("Review model rates")
audio_rate = float(catalog["avatar-iv"]["max_price_per_second"])
if not 0 < audio_rate <= 10000:
    raise SystemExit("Review audio rate")
values = {"MOTION_VIDEO_PROVIDER": "aitunnel", "MOTION_VIDEO_MODEL": model, "AVATAR_PRICE_RUB_PER_SECOND": format(audio_rate, ".6f").rstrip("0").rstrip("."), "REFERENCE_VIDEO_WORKER_ENABLED": "true"}
if mini:
    values.update({"SEEDANCE_PRICE_RUB_PER_SECOND": format(rates[0], ".6f").rstrip("0").rstrip("."), "SEEDANCE_SQUARE_PRICE_RUB_PER_SECOND": format(rates[2], ".6f").rstrip("0").rstrip(".")})
else:
    values["MOTION_PRICE_RUB_PER_SECOND"] = format(rates[0], ".6f").rstrip("0").rstrip(".")
old_env = env_path.read_text()
new_env = old_env
for key, value in values.items():
    new_env = re.sub(rf"^(?:export\s+)?{key}\s*=.*(?:\n|$)", "", new_env, flags=re.MULTILINE)
new_env = new_env.rstrip("\n") + "\n" + "\n".join(f"{key}={value}" for key, value in values.items()) + "\n"
stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
backup = Path("/etc/oblikos") / f"reference-video-backup-{stamp}"
backup.mkdir(mode=0o700)
shutil.copy2(env_path, backup / "production.env")
os.chmod(backup / "production.env", 0o600)
old_unit = unit_path.read_bytes() if unit_path.exists() else None
if old_unit is not None:
    shutil.copy2(unit_path, backup / unit_path.name)
was_active = subprocess.run(["systemctl", "is-active", "--quiet", "oblikos-video-worker"]).returncode == 0
was_enabled = subprocess.run(["systemctl", "is-enabled", "--quiet", "oblikos-video-worker"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
try:
    env_path.write_text(new_env)
    # Existing inode retains its ownership and permissions.
    unit = (root / "deploy/oblikos-video-worker.service").read_text().replace("/usr/bin/node --conditions", f"{node} --conditions")
    unit_path.write_text(unit)
    os.chmod(unit_path, 0o644)
    subprocess.run(["systemd-analyze", "verify", str(unit_path)], check=True)
    # Source credentials only inside the child shell; never print the env file.
    command = 'set -a; . /etc/oblikos/production.env; set +a; cd /opt/oblikos/current; exec runuser -u oblikos -- "$1" --conditions=react-server --import=tsx scripts/check-reference-video.ts --require-empty'
    subprocess.run(["bash", "-c", command, "bash", node], check=True)
    subprocess.run(["systemctl", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "enable", "oblikos-video-worker"], check=True)
    subprocess.run(["systemctl", "restart", "oblikos-video-worker"], check=True)
    subprocess.run(["systemctl", "restart", "oblikos"], check=True)
    for service in ("oblikos-video-worker", "oblikos"):
        subprocess.run(["systemctl", "is-active", "--quiet", service], check=True)
    subprocess.run(["curl", "--fail", "--silent", "--output", "/dev/null", "--retry", "10", "--retry-connrefused", "--retry-delay", "1", "--max-time", "5", "https://app.oblikos.ru/api/health"], check=True)
    print(f"Reference video enabled. Configuration snapshot: {backup}. Paid submissions: 0.")
except Exception:
    env_path.write_text(old_env)
    subprocess.run(["systemctl", "stop", "oblikos-video-worker"])
    if not was_enabled:
        subprocess.run(["systemctl", "disable", "oblikos-video-worker"])
    if old_unit is None:
        unit_path.unlink(missing_ok=True)
    else:
        unit_path.write_bytes(old_unit)
    subprocess.run(["systemctl", "daemon-reload"])
    if was_active:
        subprocess.run(["systemctl", "start", "oblikos-video-worker"])
    subprocess.run(["systemctl", "restart", "oblikos"])
    raise SystemExit("Reference video setup failed; previous configuration restored. No paid test was submitted.") from None
