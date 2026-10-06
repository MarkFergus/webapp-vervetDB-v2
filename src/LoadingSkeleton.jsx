import MonkeyIcon from "./MonkeyIcon";
import "./LoadingSkeleton.css";

// While the monkeys load: grey shapes where the page will be (top bar,
// Filters / Sort row, then cards or list rows, whichever view was used
// last), gently shimmering. Uses the real page's layout classes, so nothing
// jumps when the monkeys arrive. Screen readers hear "Loading monkeys…".
const CARDS = 12;
const ROWS = 14;
const VIEW_KEY = "vervetdb-view"; // the same as ShowPage's

function savedView() {
    try {
        return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
    } catch {
        return "grid";
    }
}

function LoadingSkeleton() {
    const view = savedView();
    return (
        <div className="LoadingSkeleton" role="status">
            <span className="visually-hidden">Loading monkeys…</span>
            <div aria-hidden="true">
                <div className="ShowPage-nav LoadingSkeleton-nav">
                    <span className="LoadingSkeleton-logo">
                        <MonkeyIcon color="currentColor" role={undefined} aria-label={undefined} />
                        <span className="LoadingSkeleton-title">vervetDB</span>
                    </span>
                    <span className="LoadingSkeleton-search" />
                    {/* Phones: the ☰ menu; computers: the row of icons */}
                    <span className="LoadingSkeleton-icons">
                        {Array.from({ length: 5 }, (_, i) => (
                            <span className="LoadingSkeleton-menu" key={i} />
                        ))}
                    </span>
                </div>
                <div className="ShowPage-toolbar">
                    <span className="LoadingSkeleton-pill is-filters" />
                    <span className="LoadingSkeleton-pill is-sort" />
                    <span className="LoadingSkeleton-pill is-count" />
                    <span className="LoadingSkeleton-pill LoadingSkeleton-view" />
                </div>
                {view === "list" ? (
                    <div className="MonkeyList">
                        {Array.from({ length: ROWS }, (_, i) => (
                            <div className="LoadingSkeleton-row" key={i}>
                                <span className="LoadingSkeleton-shape LoadingSkeleton-rowPhoto" />
                                <span className="LoadingSkeleton-lines">
                                    <span className="LoadingSkeleton-shape LoadingSkeleton-name" />
                                    <span className="LoadingSkeleton-shape LoadingSkeleton-details" />
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="ShowPage-monkeys">
                        {Array.from({ length: CARDS }, (_, i) => (
                            <div className="LoadingSkeleton-card" key={i}>
                                <span className="LoadingSkeleton-shape LoadingSkeleton-photo" />
                                <span className="LoadingSkeleton-shape LoadingSkeleton-name" />
                                <span className="LoadingSkeleton-shape LoadingSkeleton-details" />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default LoadingSkeleton;
