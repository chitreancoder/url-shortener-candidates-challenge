export interface Url {
  code: string;
  originalUrl: string;
  clickCount: number;
  lastClickedAt: Date | null;
  createdAt: Date;
}

export interface NewUrl {
  code: string;
  originalUrl: string;
}
