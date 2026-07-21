export function submitPrivateFileForm(url: string, form: FormData, onProgress: (progress: number | null) => void) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.responseType = "json";
    request.upload.onprogress = (event) => onProgress(event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : null);
    request.onerror = () => reject(new Error("Your file could not be uploaded. Please check your connection and try again."));
    request.onload = () => {
      const data = request.response && typeof request.response === "object" ? request.response as Record<string, unknown> : {};
      if (request.status < 200 || request.status >= 300) return reject(new Error(typeof data.message === "string" ? data.message : "Your file could not be uploaded. Please check the file type and size and try again."));
      resolve(data);
    };
    request.send(form);
  });
}

