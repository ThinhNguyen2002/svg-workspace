import { useMemo, useState } from "react";
import type { IconRecord } from "../../types";
import { formatIconCount } from "../../utils/format";

export function IconGrid({
  icons,
  selectedFilePath,
  onSelect,
  autoExpand,
}: {
  icons: IconRecord[];
  selectedFilePath: string | null;
  onSelect: (filePath: string) => void;
  autoExpand: boolean;
}) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );
  const groupedIcons = useMemo(() => {
    const groups = new Map<string, IconRecord[]>();

    for (const icon of icons) {
      const group = groups.get(icon.category) ?? [];
      group.push(icon);
      groups.set(icon.category, group);
    }

    return Array.from(groups.entries()).sort(([first], [second]) =>
      first.localeCompare(second),
    );
  }, [icons]);

  function toggleCategory(category: string) {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  return (
    <section className="icon-grid" aria-label="Icon grid">
      {groupedIcons.map(([categoryName, categoryIcons]) => (
        <section className="icon-category-group" key={categoryName}>
          <button
            aria-expanded={autoExpand || expandedCategories.has(categoryName)}
            className="category-toggle"
            type="button"
            onClick={() => toggleCategory(categoryName)}
          >
            <span>{categoryName}</span>
            <span>{formatIconCount(categoryIcons.length)}</span>
          </button>
          {autoExpand || expandedCategories.has(categoryName) ? (
            <div className="category-icon-grid">
              {categoryIcons.map((icon) => (
                <button
                  className={
                    icon.filePath === selectedFilePath
                      ? "icon-card selected"
                      : "icon-card"
                  }
                  key={icon.filePath}
                  type="button"
                  onClick={() => onSelect(icon.filePath)}
                >
                  <span
                    className="icon-preview"
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: icon.svg }}
                  />
                  <span className="icon-name">{icon.name}</span>
                  <span className="icon-category">{icon.category}</span>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ))}
    </section>
  );
}
