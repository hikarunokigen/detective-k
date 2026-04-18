## Simple Static Web Site

I'd like to come up with a very simple single page static website. We'll use
next.js for that as it is one of the most popular approaches.

## Contents

This is a website showing what we've found scraping ygosu (@scrape_ygosu).

The theme is analytical. This is a "fact-checking" analysis of an online abuser in the Internet space.

## Layout

In the upper part, I'd like to add some AI analyzed description.

At the bottom, two tables: one for posts, one for comments.

## Tables

Rendered with **TanStack Table v8** + **TanStack Virtual**. The dataset is
small enough to ship as a static JSON import at build time (~1.2k posts,
~2k comments), so we virtualize client-side rather than paginate or
lazy-fetch — rows are rendered on scroll, but all data is in memory.

Each table supports:

- sortable columns (date, votes, views, etc.)
- a linked title cell that opens the original ygosu post
- an expandable detail row for the multi-line `post_body` /
  `comment_body` (variable-height rows via TanStack Virtual)

Styling is intentionally minimal — dense type, clear column alignment —
to match the "analytical / fact-checking" theme rather than a product
dashboard.

## Styling

We use css modules, and more specifically scss.
