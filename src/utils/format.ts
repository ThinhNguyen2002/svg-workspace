export function formatIconCount(count: number) {
  return `${count} ${count === 1 ? "icon" : "icons"}`;
}

export function formatGeneratedAt(value: string | null) {
  if (!value) {
    return "Not generated";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
