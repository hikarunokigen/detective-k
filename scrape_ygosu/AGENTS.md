## Entrypoint

@scrape_ygosu/src/index.ts

## Scraping a website

Here, I'd like to scrape data. There's website called "YGosu" (와이고수). It's a website for Korean users. So they speak Korean there.

## Target information

There's a user whose id is "684134" (and current nickname "늑애") and what he's written is archived at https://ygosu.com/minilog/?member=684134&m2=article.

The table is paged by "page" query parameter as in the following.

https://ygosu.com/minilog/?m2=article&m3=list&member=684134&search=&searcht=s&page=1

I'd like to scrape what he has written. There were his "posts" and "comments", but I'd like to scrape "posts" first.

## Dom anatomy

In the table (w/ class "tbl_ua"), the column td with class "tit" is the title of the post. Inside the title td, there's an anchor element that has href (url) of the original post. I'd like to scrape title, contents, url, date, etc of these rows of the table.

Let's test scraping the first page of this table.

## Contents of post

Now, if you go to the url of the post, e.g., https://ygosu.com/board/pan_monstarz/1269094, you'll see div w/ the class "container" under div ".board_body". That's the contents of the post.

## Contents of comment

Underneath the page, there are comments.

Under ul#reply_list_layer, there is a list of li#normal_reply (s). Each li has div.body_wrap. The contents of which is the comment body. div.nick has the author of that reply.

## Parallelism

For each page in the table, there is a list of posts. In order to retreive the body and comments of each post, we need to visit that web page. Visiting a list of those web pages can be parallelized. However, we should also consider rate limiting as the host website may block us. So we need to pause every once in a while properly.

## Result format

```typescript
interface Post {
  category: string;
  title: string;
  url: string;
  listingDate: string;
  views: number;
  recommend: number;
  commentCount: number;
  postBody: string;
  comments: {
    nickname: string;
    commentBody: string;
  }[];
}
```

## Result

1. Print the URL in the console.
2. Persist the resulting data in json following the above "result format".

- File name: `ygosu__user_{user_id}__{page}__{today:yy_mm_dd}.json`
- Directory: `data/`
