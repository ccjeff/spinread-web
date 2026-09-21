import type {
  ActiveTimeline,
  CompleteUploadResponse,
  CompletedPart,
  CreateUploadRequest,
  CreateUploadResponse,
  LoginResponse,
  ProcessingStatus,
  User,
  VideoDetail,
  VideoSummary,
} from "./types";

const TOKEN_KEY = "spinread_token";
const USER_KEY = "spinread_user";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveAuth(token: string, user: User): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function loadUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function handleUnauthorized(): never {
  clearAuth();
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
  throw new ApiError(401, "UNAUTHORIZED", "登录已过期，请重新登录");
}

async function parseErrorResponse(res: Response): Promise<ApiError> {
  let code = `HTTP_${res.status}`;
  let message = `请求失败（${res.status}）`;
  let details: unknown;
  try {
    const data = (await res.json()) as {
      error?: { code?: string; message?: string; details?: unknown };
    };
    if (data && data.error) {
      if (data.error.code) code = data.error.code;
      if (data.error.message) message = data.error.message;
      details = data.error.details;
    }
  } catch {
    // 非 JSON 响应体，使用默认错误信息
  }
  return new ApiError(res.status, code, message, details);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const auth = options.auth !== false;
  const headers: Record<string, string> = {};
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  let body: string | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  const res = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
  });
  if (res.status === 401 && auth) {
    handleUnauthorized();
  }
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  if (res.status === 204 || res.status === 205) {
    return undefined as T;
  }
  const text = await res.text();
  return (text ? (JSON.parse(text) as T) : (undefined as T));
}

export async function apiFetchBlob(path: string): Promise<Blob> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401) {
    handleUnauthorized();
  }
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return res.blob();
}

export const api = {
  login(email: string, password: string) {
    return apiRequest<LoginResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
  },
  listVideos() {
    return apiRequest<VideoSummary[]>("/videos");
  },
  getVideo(id: string) {
    return apiRequest<VideoDetail>(`/videos/${id}`);
  },
  deleteVideo(id: string) {
    return apiRequest<void>(`/videos/${id}`, { method: "DELETE" });
  },
  createUpload(body: CreateUploadRequest) {
    return apiRequest<CreateUploadResponse>("/video-uploads", { method: "POST", body });
  },
  completeUpload(uploadId: string, parts: CompletedPart[]) {
    return apiRequest<CompleteUploadResponse>(`/video-uploads/${uploadId}/complete`, {
      method: "POST",
      body: { parts },
    });
  },
  getProcessingStatus(id: string) {
    return apiRequest<ProcessingStatus>(`/videos/${id}/processing-status`);
  },
  getActiveTimeline(id: string) {
    return apiRequest<ActiveTimeline>(`/videos/${id}/timelines/active`);
  },
};
