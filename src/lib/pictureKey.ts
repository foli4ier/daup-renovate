const PICTURE_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Property picture ids are `[A-Za-z0-9_-]{1,128}`. Local keys use colons
 * (`photo:photo_<uuid>`, `request:<id>:before`). `:` becomes `__`.
 * A key that would not round-trip is escaped with a `z` prefix.
 */
export function encodePictureId(localId: string): string | null {
  const simple = localId.replaceAll(":", "__");
  if (PICTURE_ID.test(simple) && simple.replaceAll("__", ":") === localId) return simple;
  let escaped = "z";
  for (const char of localId) {
    if (char === "_") escaped += "_0";
    else if (char === ":") escaped += "_1";
    else if (/[A-Za-z0-9-]/.test(char)) escaped += char;
    else return null;
  }
  if (!PICTURE_ID.test(escaped)) return null;
  if (decodePictureId(escaped) !== localId) return null;
  return escaped;
}

export function decodePictureId(remoteId: string): string {
  if (remoteId.startsWith("z")) {
    let out = "";
    const body = remoteId.slice(1);
    for (let index = 0; index < body.length; index += 1) {
      const char = body[index];
      const next = body[index + 1];
      if (char === "_" && next === "0") {
        out += "_";
        index += 1;
        continue;
      }
      if (char === "_" && next === "1") {
        out += ":";
        index += 1;
        continue;
      }
      out += char ?? "";
    }
    return out;
  }
  return remoteId.replaceAll("__", ":");
}
