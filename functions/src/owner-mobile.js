// Cairo calendar keys are compared lexically; no UTC midnight is used for reports.
export function cairoKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export function ownerRange(preset, now = new Date(), from = "", to = "") {
  const today = cairoKey(now);
  const shift = days => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const month = today.slice(0, 7);
  const previous = new Date(`${month}-01T12:00:00Z`);
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  const priorMonth = previous.toISOString().slice(0, 7);
  const values = {
    today: [today, today], yesterday: [shift(-1), shift(-1)], week: [shift(-6), today],
    month: [`${month}-01`, today], previousMonth: [`${priorMonth}-01`, shift(-Number(today.slice(-2)))],
    year: [shift(-365), today], all: ["", today],
    day: [from, from], range: [from, to]
  };
  if (!Object.hasOwn(values, preset)) throw new Error("INVALID_PERIOD");
  const [start, end] = values[preset];
  if (["day", "range"].includes(preset) && (!start || !end)) throw new Error("INVALID_PERIOD");
  if (end && (!/^\d{4}-\d{2}-\d{2}$/.test(end) || end > today)) throw new Error("INVALID_PERIOD");
  if (start && (!/^\d{4}-\d{2}-\d{2}$/.test(start) || start > end)) throw new Error("INVALID_PERIOD");
  for (const value of [start, end].filter(Boolean)) if (new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error("INVALID_PERIOD");
  return { from: start, to: end };
}
