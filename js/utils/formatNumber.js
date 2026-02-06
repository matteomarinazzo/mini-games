export function formatCoins(value) {
    if (value === Infinity || value === null) return value;
  if (value < 1) {
    return value.toFixed(2) + "c";
  }

  const units = [
    { value: 1e12, suffix: "T" },
    { value: 1e9,  suffix: "B" },
    { value: 1e6,  suffix: "M" },
    { value: 1e3,  suffix: "k" },
  ];

  for (const unit of units) {
    if (value >= unit.value) {
      const formatted = value / unit.value;

      return (
        (formatted % 1 === 0
          ? formatted.toString()
          : formatted.toFixed(2).replace(/\.?0+$/, "")
        ) + unit.suffix
      );
    }
  }

  return Math.floor(value) + "c";
}
