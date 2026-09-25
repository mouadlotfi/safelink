import { NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const origin = escapeXml(
    new URL(process.env.NEXT_PUBLIC_WEBSITE_URL || request.nextUrl.origin).origin
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>Safe Clean</ShortName>
  <Description>Clean tracking parameters from a URL</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Url type="text/html" method="get" template="${origin}/go/clean?url={searchTerms}" />
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
