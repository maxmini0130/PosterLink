import {
  getVerifiedPosterCalendarSource,
  type PosterStructuredTrustInput,
} from "./posterStructuredTrust";

export type PosterCalendarInput = PosterStructuredTrustInput & {
  id: string;
  title: string;
};

export type PosterCalendarFile = {
  content: string;
  filename: string;
};

function escapeCalendarText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/([,;])/g, "\\$1")
    .replace(/\r?\n/g, "\\n");
}

function toCalendarDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function buildVerifiedPosterCalendar(
  poster: PosterCalendarInput,
  link?: string | null,
  now = new Date(),
): PosterCalendarFile | null {
  const source = getVerifiedPosterCalendarSource(poster);
  if (!source) return null;

  const start = toCalendarDate(source.startAt);
  if (!start) return null;
  const fallbackEnd = new Date(new Date(source.startAt).getTime() + 60 * 60 * 1000).toISOString();
  const end = toCalendarDate(source.endAt || fallbackEnd);
  const stamp = toCalendarDate(now.toISOString());
  if (!end || !stamp) return null;

  const summary = source.kind === "event" ? poster.title : `${poster.title} 신청 마감`;
  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PosterLink//Public Opportunity//KO",
    "BEGIN:VEVENT",
    `UID:${poster.id}@posterlink.kr`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeCalendarText(summary)}`,
    ...(link ? [`URL:${link}`, `DESCRIPTION:${escapeCalendarText(`공식 공고: ${link}`)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return {
    content,
    filename: `posterlink-${poster.id}.ics`,
  };
}
