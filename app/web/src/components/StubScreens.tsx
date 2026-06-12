// Placeholder Explore and Changes screens. The four-tab bar ships in this slice
// (5.1), but the Explore feed (slice 7.1) and the Changes record (slice 6.1) are
// built later. These stubs give each tab a calm empty state so the bar is fully
// navigable now.

export function ExploreScreen() {
  return (
    <div className="screen__scroll">
      <div className="screen__header">
        <h1 className="screen__title">Explore</h1>
        <div className="screen__subtitle">Dishes you have not cooked yet</div>
      </div>
      <div className="empty-state">
        <div className="empty-state__title">Coming soon</div>A ranked, familiar-but-new feed of
        dishes to try lands here.
      </div>
    </div>
  );
}

export function ChangesScreen() {
  return (
    <div className="screen__scroll">
      <div className="screen__header">
        <h1 className="screen__title">Changes</h1>
        <div className="screen__subtitle">Everything done to this week&rsquo;s menu</div>
      </div>
      <div className="empty-state">
        <div className="empty-state__title">Coming soon</div>
        Every edit, with who made it and why, will be recorded here.
      </div>
    </div>
  );
}
