import type { CompletedPart, UploadPartInfo } from "./types";

function putPart(url: string, blob: Blob, onProgress: (loaded: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(ev.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag");
        if (etag) {
          resolve(etag);
        } else {
          reject(new Error("分片响应缺少 ETag"));
        }
      } else {
        reject(new Error(`分片上传失败（HTTP ${xhr.status}）`));
      }
    };
    xhr.onerror = () => reject(new Error("分片上传网络错误"));
    xhr.ontimeout = () => reject(new Error("分片上传超时"));
    xhr.send(blob);
  });
}

interface UploadPartsOptions {
  file: File;
  parts: UploadPartInfo[];
  partSize: number;
  concurrency?: number;
  retries?: number;
  onProgress?: (uploadedBytes: number, totalBytes: number) => void;
}

export async function uploadFileParts(options: UploadPartsOptions): Promise<CompletedPart[]> {
  const { file, parts, partSize } = options;
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const retries = Math.max(1, options.retries ?? 3);
  const loadedByPart = new Array<number>(parts.length).fill(0);

  const report = () => {
    if (!options.onProgress) return;
    const uploaded = loadedByPart.reduce((sum, n) => sum + n, 0);
    options.onProgress(Math.min(uploaded, file.size), file.size);
  };

  const results: CompletedPart[] = [];
  let next = 0;

  const worker = async () => {
    while (next < parts.length) {
      const idx = next;
      next += 1;
      const part = parts[idx];
      const start = (part.part_number - 1) * partSize;
      const end = Math.min(start + partSize, file.size);
      const blob = file.slice(start, end);
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= retries; attempt += 1) {
        loadedByPart[idx] = 0;
        try {
          const etag = await putPart(part.presigned_url, blob, (loaded) => {
            loadedByPart[idx] = loaded;
            report();
          });
          loadedByPart[idx] = blob.size;
          report();
          results.push({ part_number: part.part_number, etag });
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
        }
      }
      if (lastError) throw lastError;
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, parts.length) }, () => worker()),
  );
  return results.sort((a, b) => a.part_number - b.part_number);
}
