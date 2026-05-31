import { Injectable } from "@nestjs/common";
import sanitizeHtml from "sanitize-html";

@Injectable()
export class HtmlSanitizerService {
  sanitize(input: string | null | undefined): string {
    if (!input) {
      return "";
    }

    return sanitizeHtml(input, {
      allowedTags: [
        "p",
        "br",
        "strong",
        "b",
        "em",
        "i",
        "u",
        "s",
        "ol",
        "ul",
        "li",
        "blockquote",
        "code",
        "pre",
        "a",
        "span",
        "img"
      ],
      allowedAttributes: {
        a: ["href", "name", "target", "rel"],
        img: ["src", "alt", "title", "width", "height", "data-attachment-id"],
        span: ["class"]
      },
      allowedSchemes: ["http", "https", "mailto", "cid"],
      transformTags: {
        a: sanitizeHtml.simpleTransform("a", {
          rel: "noopener noreferrer",
          target: "_blank"
        })
      }
    });
  }
}
