param(
  [Parameter(Mandatory = $true)][string]$Server,
  [ValidateRange(1, 65535)][int]$Port = 22,
  [switch]$PrepareOnly
)
$ErrorActionPreference = 'Stop'
if ($Server -notmatch '^[a-zA-Z0-9_.-]+@[a-zA-Z0-9.-]+$') { throw 'Use user@hostname for -Server.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
$release = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + ([guid]::NewGuid().ToString('N').Substring(0, 8))
$archive = Join-Path ([IO.Path]::GetTempPath()) "oblikos-$release.tar.gz"
function Invoke-Checked([string]$Program, [string[]]$Arguments) {
  & $Program @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Program failed (exit $LASTEXITCODE). Deployment stopped." }
}
try {
  $files = @('src', 'public', 'prisma', 'scripts', 'deploy', 'docs', 'tests',
    'package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts',
    'next-env.d.ts', 'postcss.config.mjs', 'eslint.config.mjs',
    'prisma.config.ts', '.nvmrc', '.npmrc', '.env.example', 'README.md') |
    Where-Object { Test-Path -LiteralPath (Join-Path $projectRoot $_) }
  Invoke-Checked 'tar.exe' (@('-czf', $archive, '--exclude=src/generated',
    '--exclude=*.tsbuildinfo', '--exclude=*.log', '--exclude=.env', '--exclude=.env.*', '-C', $projectRoot) + $files)
  if ($PrepareOnly) {
    Write-Host "Prepared: $archive"
    Invoke-Checked 'tar.exe' @('-tzf', $archive)
    return
  }
  # SSH verifies the host key; credentials are handled by OpenSSH, never stored here.
  Invoke-Checked 'ssh.exe' @('-p', "$Port", $Server, 'test -L /opt/oblikos/current && test -r /etc/oblikos/production.env')
  Invoke-Checked 'scp.exe' @('-P', "$Port", $archive, "${Server}:/opt/oblikos/releases/$release.tar.gz")
  Invoke-Checked 'scp.exe' @('-P', "$Port", (Join-Path $PSScriptRoot 'deploy-release.sh'), "${Server}:/opt/oblikos/releases/$release.sh")
  Invoke-Checked 'ssh.exe' @('-t', '-p', "$Port", $Server, "sudo bash /opt/oblikos/releases/$release.sh $release")
  Write-Host 'Site updated successfully.'
} finally {
  if (!$PrepareOnly -and (Test-Path -LiteralPath $archive)) { Remove-Item -LiteralPath $archive }
}
