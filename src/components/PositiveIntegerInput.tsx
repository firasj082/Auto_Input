import React, { useState, useEffect } from "react";

interface Props {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * PositiveIntegerInput enforces positive, non-zero numeric input validation.
 * It clamps the value on blur to ensure it stays within the range [min, max].
 */
export const PositiveIntegerInput: React.FC<Props> = ({
  value,
  onChange,
  min = 1,
  max = Infinity,
  label,
  disabled = false,
  className = "",
  style,
}) => {
  const [inputValue, setInputValue] = useState<string>(value.toString());

  // Keep local state in sync with external value prop updates
  useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    
    // Allow empty string so the user can backspace and type
    if (rawVal === "") {
      setInputValue("");
      return;
    }

    // Only allow digits
    if (/^\d*$/.test(rawVal)) {
      setInputValue(rawVal);
    }
  };

  const handleBlur = () => {
    if (inputValue === "") {
      // Revert to minimum value if empty on blur
      onChange(min);
      setInputValue(min.toString());
      return;
    }

    let parsed = parseInt(inputValue, 10);
    if (isNaN(parsed)) {
      parsed = min;
    }

    // Clamp value to [min, max] range
    const clamped = Math.max(min, Math.min(max, parsed));
    onChange(clamped);
    setInputValue(clamped.toString());
  };

  return (
    <div className={`input-container ${className}`} style={style}>
      {label && <label className="input-label">{label}</label>}
      <input
        type="text"
        className="input-field"
        value={inputValue}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
      />
    </div>
  );
};
