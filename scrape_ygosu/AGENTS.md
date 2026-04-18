## Entrypoint

@scrape_ygosu/src/index.ts

## Scraping a website

Here, I'd like to scrape data. There's website called "YGosu" (와이고수). It's a website for Korean users. So they speak Korean there.

## Target information

There's a user whose id is "684134" (and current nickname "늑애") and what he's written is archived at https://ygosu.com/minilog/?member=684134&m2=article. I'd like to scrape what he has written. There were his "posts" and "comments", but I'd like to scrape "posts" first.

## Dom anatomy

In the table (w/ class "tbl_ua"), the column td with class "tit" is the title of the post. Inside the title td, there's an anchor element that has href (url) of the original post. I'd like to scrape title, contents, url, date, etc of these rows of the table.

Let's test scraping the first page of this table.

## Result

1. Print the URL in the console.
2. Print each row also in the console.
