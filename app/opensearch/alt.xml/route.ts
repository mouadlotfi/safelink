import { NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const origin = escapeXml(request.nextUrl.origin);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>Safelink Alt</ShortName>
  <Description>Open a privacy-friendly alternative for a URL when available</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Url type="text/html" method="get" template="${origin}/go/alt?url={searchTerms}" />
  <SearchForm>${origin}</SearchForm>
</OpenSearchDescription>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/opensearchdescription+xml; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;"
    };
    return entities[character];
  });
