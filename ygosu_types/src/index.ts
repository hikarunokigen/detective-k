/**
 * Shapes that both the scraper (scrape_ygosu) and the website consume.
 * Keep these aligned with POST.md / COMMENT.md — they're the wire format
 * of the JSON files persisted under `data/yg_post/` and `data/yg_comment/`.
 */

export interface PostComment {
  user_id: string;
  nickname: string;
  reply_nick: string | null;
  comment_body: string;
  vote_good: number;
  vote_bad: number;
}

export interface Post {
  post_id: string;
  category: string;
  title: string;
  url: string;
  listing_date: string;
  listing_datetime: string;
  views: number;
  recommend: number;
  comment_count: number;
  is_blinded: boolean;
  post_body: string;
  good_vote: number;
  bad_vote: number;
  comments: PostComment[];
}

export interface Comment {
  post_id: string;
  post_title: string;
  comment_id: string;
  comment_body: string;
  comment_datetime: string;
  vote_good: number;
  vote_bad: number;
}
