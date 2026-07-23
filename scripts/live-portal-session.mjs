function decodeAttribute(value) {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

export async function confirmPortalSession(baseUrl, tokenHash, type = "magiclink") {
  const confirmUrl = `${baseUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}`;
  const confirmationPage = await fetch(confirmUrl, { redirect: "manual" });
  const html = await confirmationPage.text();
  if (confirmationPage.status !== 200 || !html.includes("Continue to REALMS Portal")) {
    throw new Error(`Secure confirmation page was unavailable (${confirmationPage.status}).`);
  }

  const formHtml = html.match(/<form[^>]*method="POST"[^>]*>[\s\S]*?<\/form>/)?.[0];
  if (!formHtml) throw new Error("Secure confirmation form was not found.");
  const form = new FormData();
  for (const input of formHtml.matchAll(/<input\b[^>]*\bname="([^"]+)"[^>]*>/g)) {
    const value = input[0].match(/\bvalue="([^"]*)"/)?.[1] ?? "";
    form.append(decodeAttribute(input[1]), decodeAttribute(value));
  }

  const confirmed = await fetch(confirmUrl, { method: "POST", body: form, redirect: "manual" });
  if (![303, 307].includes(confirmed.status)) {
    throw new Error(`Secure confirmation did not establish a session (${confirmed.status}).`);
  }
  const setCookies = confirmed.headers.getSetCookie();
  if (!setCookies.length) throw new Error("Secure confirmation did not issue a portal session.");
  return {
    status: confirmed.status,
    location: confirmed.headers.get("location"),
    cookie: setCookies.map((value) => value.split(";", 1)[0]).join("; "),
  };
}
