/**
 * A minimal /api/home response for browser-mocked specs: the given posters as
 * the first "새로 올라온 공고" page, nothing else. Same shape as
 * lib/homeFeedServer HomeFeedResult.
 */
export function homeStub(
  posters: Array<{ id: string; title: string }>,
  { freshSince = 0 }: { freshSince?: number } = {},
) {
  const display = {
    reception: "open",
    text: "D-7",
    tone: "accent",
    daysLeft: 7,
    dateTrusted: true,
    endDateLabel: null,
  };
  return {
    scopeLabel: "서울 전체",
    shortcuts: [],
    from: 1,
    layout: {
      picks: [],
      deadline: [],
      followed: [],
      deadlineTotal: 0,
      openTotal: posters.length,
      freshSince,
      hasMore: false,
      pages: [
        [
          {
            kind: "new",
            items: posters.map((poster) => ({
              id: poster.id,
              display,
              card: { id: poster.id, title: poster.title, tags: [] },
            })),
          },
        ],
      ],
    },
  };
}
