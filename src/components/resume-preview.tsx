"use client";

import { useMemo } from "react";

type Section = {
  type: "header" | "contact" | "target" | "heading" | "summary-item" | "skills" | "experience-entry" | "experience-date" | "bullet" | "text" | "blank";
  text: string;
};

const SECTION_HEADINGS = new Set([
  "PROFESSIONAL SUMMARY",
  "SKILLS",
  "EXPERIENCE",
  "EDUCATION",
  "CERTIFICATIONS",
]);

function parseResumeContent(raw: string): Section[] {
  const lines = raw.split(/\r?\n/);
  const sections: Section[] = [];
  let isFirstLine = true;
  let isSecondLine = false;
  let prevHeading = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      sections.push({ type: "blank", text: "" });
      continue;
    }

    // First non-blank line = candidate name
    if (isFirstLine) {
      sections.push({ type: "header", text: trimmed });
      isFirstLine = false;
      isSecondLine = true;
      continue;
    }

    // Second non-blank line with pipes = contact info
    if (isSecondLine && trimmed.includes(" | ")) {
      sections.push({ type: "contact", text: trimmed });
      isSecondLine = false;
      continue;
    }
    isSecondLine = false;

    // "Target role:" line
    if (trimmed.startsWith("Target role:")) {
      sections.push({ type: "target", text: trimmed });
      continue;
    }

    // Section headings
    if (SECTION_HEADINGS.has(trimmed)) {
      prevHeading = trimmed;
      sections.push({ type: "heading", text: trimmed });
      continue;
    }

    // Bullet points
    if (/^[-•]\s/.test(trimmed)) {
      sections.push({ type: "bullet", text: trimmed.slice(2) });
      continue;
    }

    // Skills line (contains · separator)
    if (prevHeading === "SKILLS" && trimmed.includes(" · ")) {
      sections.push({ type: "skills", text: trimmed });
      continue;
    }

    // Experience entries (lines with | under EXPERIENCE)
    if (prevHeading === "EXPERIENCE" && trimmed.includes(" | ")) {
      sections.push({ type: "experience-entry", text: trimmed });
      continue;
    }

    // Date ranges under experience (e.g. "Jan 2020 – Dec 2022")
    if (prevHeading === "EXPERIENCE" && /\d{4}/.test(trimmed) && trimmed.includes("–")) {
      sections.push({ type: "experience-date", text: trimmed });
      continue;
    }

    // Summary items under professional summary
    if (prevHeading === "PROFESSIONAL SUMMARY") {
      sections.push({ type: "summary-item", text: trimmed });
      continue;
    }

    // Default text
    sections.push({ type: "text", text: trimmed });
  }

  return sections;
}

export function ResumePreview({ content }: { content: string }) {
  const sections = useMemo(() => parseResumeContent(content), [content]);

  if (!content.trim()) {
    return (
      <div className="resume-preview-empty">
        <p>No resume content to preview.</p>
      </div>
    );
  }

  return (
    <div className="resume-preview" aria-label="Formatted resume preview">
      {sections.map((section, i) => {
        switch (section.type) {
          case "header":
            return (
              <h2 key={i} className="resume-name">
                {section.text}
              </h2>
            );
          case "contact":
            return (
              <div key={i} className="resume-contact">
                {section.text.split(" | ").map((part, j) => (
                  <span key={j} className="resume-contact-item">
                    {part.trim().startsWith("http") || part.trim().includes("linkedin") ? (
                      <a href={part.trim().startsWith("http") ? part.trim() : `https://${part.trim()}`} target="_blank" rel="noopener noreferrer">
                        {part.trim()}
                      </a>
                    ) : (
                      part.trim()
                    )}
                  </span>
                ))}
              </div>
            );
          case "target":
            return (
              <div key={i} className="resume-target">
                <span className="resume-target-label">Target role:</span>{" "}
                <span className="resume-target-value">{section.text.replace("Target role:", "").trim()}</span>
              </div>
            );
          case "heading":
            return (
              <h3 key={i} className="resume-section-heading">
                {section.text}
              </h3>
            );
          case "summary-item":
            return (
              <p key={i} className="resume-summary-item">
                {section.text}
              </p>
            );
          case "skills":
            return (
              <div key={i} className="resume-skills">
                {section.text.split(" · ").map((skill, j) => (
                  <span key={j} className="resume-skill-badge">
                    {skill.trim()}
                  </span>
                ))}
              </div>
            );
          case "experience-entry":
            return (
              <div key={i} className="resume-exp-entry">
                {(() => {
                  const parts = section.text.split(" | ");
                  return (
                    <>
                      <span className="resume-exp-title">{parts[0]?.trim()}</span>
                      {parts[1] && <span className="resume-exp-company">{parts[1].trim()}</span>}
                    </>
                  );
                })()}
              </div>
            );
          case "experience-date":
            return (
              <p key={i} className="resume-exp-date">
                {section.text}
              </p>
            );
          case "bullet":
            return (
              <div key={i} className="resume-bullet">
                <span className="resume-bullet-dot" aria-hidden="true">•</span>
                <span>{section.text}</span>
              </div>
            );
          case "blank":
            return <div key={i} className="resume-spacer" />;
          default:
            return (
              <p key={i} className="resume-text">
                {section.text}
              </p>
            );
        }
      })}
    </div>
  );
}
