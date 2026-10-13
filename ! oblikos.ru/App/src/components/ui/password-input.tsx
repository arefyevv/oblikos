"use client";

import { useState, type ComponentProps } from "react";
import { Icon } from "./icon";

export function PasswordInput({
  id,
  disabled,
  visibilityLabel = "пароль",
  ...props
}: Omit<ComponentProps<"input">, "type"> & { id: string; visibilityLabel?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-input">
      <input {...props} id={id} disabled={disabled} type={visible ? "text" : "password"} />
      <button
        type="button"
        className="password-input__toggle"
        aria-label={`${visible ? "Скрыть" : "Показать"} ${visibilityLabel}`}
        aria-controls={id}
        aria-pressed={visible}
        disabled={disabled}
        onClick={() => setVisible((previous) => !previous)}
      >
        <Icon name={visible ? "eyeOff" : "eye"} size={20} />
      </button>
    </div>
  );
}
