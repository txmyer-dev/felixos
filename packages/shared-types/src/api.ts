export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "internal_error";

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  details?: unknown;
};

export type ApiSuccess<TData> = {
  ok: true;
  data: TData;
};

export type ApiFailure = {
  ok: false;
  error: ApiError;
};

export type ApiResult<TData> = ApiSuccess<TData> | ApiFailure;

export type PageInfo = {
  nextCursor: string | null;
};

export type ListResponse<TItem> = {
  items: TItem[];
  pageInfo: PageInfo;
};
