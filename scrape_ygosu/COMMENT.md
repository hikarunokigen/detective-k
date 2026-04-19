# Scraping Comment

## Entrypoint

@scrape_ygosu/src/comment.ts

## Reference

Scraping is generally similar in approach to @scrape_ygosu/POST.md. This is a next step task after scraping POSTs.

## Target information

We still scrape comments from a user whose id is "684134" (and current nickname "늑애") and what he's written is archived at https://ygosu.com/minilog/?m2=article&member=684134&m3=comment

The table is paged by "page" query parameter as in the following.

https://ygosu.com/minilog/?m2=article&m3=comment&member=684134&search=&page=2

I'd like to scrape comments he has written.

div.title has the title of the post his comments were written.

- div.mrbox:nth-child(1) > div:nth-child(1) > h5:nth-child(1) > a:nth-child(1), this has the "board" the comments were attached.

- div.mrbox:nth-child(1) > div:nth-child(1) > h5:nth-child(1) > a:nth-child(2), and this is the post in that board his comments were written.

- div.mrbox:nth-child(1) > div:nth-child(1) > p:nth-child(2) has the datetime of this comment created.

- div.mrbox:nth-child(1) > div:nth-child(2) > span:nth-child(3) here also has the good/bad votes this comment got.

- "div.mrbox:nth-child(1) > div:nth-child(1) > h5:nth-child(1) > a:nth-child(1)div.mrbox:nth-child(1) > div:nth-child(1) > h5:nth-child(1) > a:nth-child(1)" has board information.

For example, in the page "https://ygosu.com/minilog/?m2=article&m3=comment&member=684134&search=&page=1", the first comment has the following information.

"[스타대학]" is the name of the board.
"/board/pan_monstarz/1290400/?comment_idx=2755303" is the URL of the post.
"1290400" is the post id.
"2755303" is the comment id
"근데 혹시 케이대도 같이보는 사람있음?" is the title of the post.
"2026-04-19 00:34:58" is the datetime of this comment.
"애들방 구걸이라도하면 선녀지 시발 개소리노\n\n 앉아서 담배피다가 시간되면 다시 노력하는척함" is the body of comment.
"1" (number) is the good vote, "0" (number) is the down vote.
"[스타대학]" is the board name.
"pan_monstarz" is the board id.

## Result format

```typescript
interface Comment {
  post_id: string;
  post_title: string;
  comment_id: string;
  comment_body: string;
  comment_datetime: string;
  board_id: string;
  board_name: string;
  vote_good: number;
  vote_bad: number;
}
```

## Result

1. Print the URL in the console.
2. Persist the resulting data in json following the above "result format".

- File name: `ygosu__cmt__user_{user_id}__{page}__{today:yy_mm_dd}.json`
- Directory: `data/yg_comment/`
