"use client";

/**
 * Renderer de blocs CMS (spec §6.7).
 *
 * Composant pur qui prend un tableau de blocs + une locale et produit le
 * rendu visuel. Utilisé :
 *  - Par l'éditeur admin (panneau "Preview live")
 *  - Par la page publique /cms/[slug] (côté client après fetch)
 *
 * Tolérant aux blocs malformés : si un bloc est invalide, on le skip
 * silencieusement plutôt que de planter le render entier.
 */

import Link from "next/link";

interface LocalizedText {
  fr: string;
  [k: string]: string;
}

function L(text: LocalizedText | undefined, locale: string): string {
  if (!text) return "";
  return text[locale] ?? text.fr ?? "";
}

interface Props {
  blocks: any[];
  locale?: string;
  /** Si true, rend les boutons en mode "preview" (pas de navigation) */
  preview?: boolean;
}

export function CmsRenderer({ blocks, locale = "fr", preview }: Props) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          color: "var(--muted)",
          fontStyle: "italic",
          fontSize: 13,
        }}
      >
        Cette page est vide. Ajoute des blocs depuis l'éditeur ✨
      </div>
    );
  }

  return (
    <article
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "20px 0",
        lineHeight: 1.6,
      }}
    >
      {blocks.map((b, i) => {
        if (!b || typeof b !== "object") return null;
        const key = b.id ?? `b-${i}`;
        switch (b.type) {
          case "heading":
            return renderHeading(b, locale, key);
          case "paragraph":
            return renderParagraph(b, locale, key);
          case "image":
            return renderImage(b, locale, key);
          case "button":
            return renderButton(b, locale, key, preview);
          case "divider":
            return renderDivider(b, key);
          case "quote":
            return renderQuote(b, locale, key);
          default:
            return null;
        }
      })}
    </article>
  );
}

function renderHeading(b: any, locale: string, key: string) {
  const text = L(b.text, locale);
  const align = b.align ?? "left";
  const sharedStyle: React.CSSProperties = {
    fontFamily: "Cormorant Garamond, serif",
    color: "var(--cream)",
    margin: "20px 0 8px",
    textAlign: align as any,
    fontWeight: 700,
  };
  if (b.level === 1) {
    return (
      <h1 key={key} style={{ ...sharedStyle, fontSize: 32, lineHeight: 1.2 }}>
        {text}
      </h1>
    );
  }
  if (b.level === 3) {
    return (
      <h3 key={key} style={{ ...sharedStyle, fontSize: 18 }}>
        {text}
      </h3>
    );
  }
  return (
    <h2 key={key} style={{ ...sharedStyle, fontSize: 24 }}>
      {text}
    </h2>
  );
}

function renderParagraph(b: any, locale: string, key: string) {
  const text = L(b.text, locale);
  return (
    <p
      key={key}
      style={{
        fontSize: 15,
        color: "var(--cream-soft)",
        margin: "10px 0",
        textAlign: (b.align ?? "left") as any,
        whiteSpace: "pre-wrap",
      }}
    >
      {text}
    </p>
  );
}

function renderImage(b: any, locale: string, key: string) {
  const alt = L(b.alt, locale);
  const caption = L(b.caption, locale);
  const maxWidth = `${b.maxWidthPct ?? 100}%`;
  return (
    <figure key={key} style={{ margin: "16px 0", textAlign: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={b.src}
        alt={alt}
        style={{
          maxWidth,
          height: "auto",
          borderRadius: 12,
          display: "inline-block",
        }}
      />
      {caption && (
        <figcaption
          style={{
            fontSize: 11,
            color: "var(--muted)",
            fontStyle: "italic",
            marginTop: 6,
          }}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function renderButton(
  b: any,
  locale: string,
  key: string,
  preview?: boolean,
) {
  const label = L(b.label, locale) || "Bouton";
  const variant = b.variant ?? "primary";
  const styleBase: React.CSSProperties = {
    display: "inline-block",
    padding: "10px 18px",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    textDecoration: "none",
    margin: "12px 0",
    cursor: preview ? "default" : "pointer",
    transition: "transform 0.1s",
  };
  let style: React.CSSProperties;
  if (variant === "ghost") {
    style = {
      ...styleBase,
      background: "transparent",
      border: "1px solid var(--saffron)",
      color: "var(--saffron)",
    };
  } else if (variant === "subtle") {
    style = {
      ...styleBase,
      background: "var(--overlay-2)",
      color: "var(--cream)",
    };
  } else {
    style = {
      ...styleBase,
      background: "linear-gradient(135deg, var(--saffron), var(--terracotta))",
      color: "#16111e",
    };
  }
  const href = b.href ?? "#";
  const isExternal = href.startsWith("http") || b.newTab;
  if (preview) {
    // Preview : on rend comme un span pour ne pas naviguer
    return (
      <div key={key} style={{ textAlign: "center" }}>
        <span style={style}>{label}</span>
      </div>
    );
  }
  if (isExternal) {
    return (
      <div key={key} style={{ textAlign: "center" }}>
        <a
          href={href}
          target={b.newTab ? "_blank" : undefined}
          rel={b.newTab ? "noopener noreferrer" : undefined}
          style={style}
        >
          {label}
        </a>
      </div>
    );
  }
  return (
    <div key={key} style={{ textAlign: "center" }}>
      <Link href={href} style={style}>
        {label}
      </Link>
    </div>
  );
}

function renderDivider(b: any, key: string) {
  if (b.style === "stars") {
    return (
      <div
        key={key}
        aria-hidden
        style={{
          textAlign: "center",
          color: "var(--saffron)",
          fontSize: 14,
          letterSpacing: 8,
          margin: "20px 0",
        }}
      >
        ★ ★ ★
      </div>
    );
  }
  return (
    <hr
      key={key}
      style={{
        border: "none",
        borderTop:
          b.style === "dotted"
            ? "1px dotted var(--line-soft)"
            : "1px solid var(--line-soft)",
        margin: "20px 0",
      }}
    />
  );
}

function renderQuote(b: any, locale: string, key: string) {
  const text = L(b.text, locale);
  return (
    <blockquote
      key={key}
      style={{
        borderLeft: "3px solid var(--saffron)",
        margin: "16px 0",
        padding: "10px 16px",
        fontStyle: "italic",
        color: "var(--cream-soft)",
        background: "rgba(232,163,61,0.05)",
        borderRadius: "0 8px 8px 0",
      }}
    >
      {text}
      {b.author && (
        <footer
          style={{
            marginTop: 8,
            fontSize: 12,
            color: "var(--muted)",
            fontStyle: "normal",
          }}
        >
          — {b.author}
        </footer>
      )}
    </blockquote>
  );
}
