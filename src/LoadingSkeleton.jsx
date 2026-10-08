import { useEffect } from "react";
import MonkeyIcon from "./MonkeyIcon";
import "./NavBars.css"; // (the side rail's and bottom bar's sizes)
import "./LoadingSkeleton.css";

// While the monkeys load: grey shapes where the page will be (top bar,
// Filters / Sort row, then cards or list rows, whichever view was used
// last), gently shimmering, with the side rail (computers) or bottom bar
// (phones). Uses the real page's layout classes, so nothing jumps when the
// monkeys arrive. Screen readers hear "Loading monkeys…".
const CARDS = 12;
const ROWS = 14;
const VIEW_KEY = "vervetdb-view"; // the same as ShowPage's
const RAIL_KEY = "vervetdb-rail"; // the same as Nav's

function savedView() {
    try {
        return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
    } catch {
        return "grid";
    }
}

function LoadingSkeleton() {
    const view = savedView();
    // The side rail at the size it was left (as Nav does)
    useEffect(() => {
        try {
            document.documentElement.classList.toggle("rail-open", localStorage.getItem(RAIL_KEY) === "open");
        } catch {
            // (small, then)
        }
    }, []);
    return (
        <div className="LoadingSkeleton" role="status">
            <span className="visually-hidden">Loading monkeys…</span>
            <div aria-hidden="true">
                <div className="ShowPage-nav LoadingSkeleton-nav">
                    <span className="LoadingSkeleton-logo">
                        {/* Computers: the ☰ for the side rail */}
                        <span className="LoadingSkeleton-menu LoadingSkeleton-railButton" />
                        <MonkeyIcon color="currentColor" role={undefined} aria-label={undefined} />
                        <span className="LoadingSkeleton-title">vervetDB</span>
                    </span>
                    <span className="LoadingSkeleton-search" />
                    {/* Phones: the ☰ menu; computers: the account circle */}
                    <span className="LoadingSkeleton-icons">
                        <span className="LoadingSkeleton-menu" />
                    </span>
                </div>
                {/* Computers: the side rail's icons; phones: the bottom bar */}
                <div className="LoadingSkeleton-rail">
                    {Array.from({ length: 4 }, (_, i) => (
                        <span className="LoadingSkeleton-menu" key={i} />
                    ))}
                </div>
                <div className="LoadingSkeleton-bottomBar">
                    {Array.from({ length: 5 }, (_, i) => (
                        <span className="LoadingSkeleton-menu" key={i} />
                    ))}
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
