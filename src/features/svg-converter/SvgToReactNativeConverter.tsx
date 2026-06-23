import { useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { githubLight } from "@uiw/codemirror-theme-github";
import { javascript } from "@codemirror/lang-javascript";
import { xml } from "@codemirror/lang-xml";
import { convertSvgToJsx, sampleSvg } from "./converter";

type ConverterPanelTab = "preview" | "react-native" | "react";

export function SvgToReactNativeConverter({
  onCopy,
}: {
  onCopy: (value: string, label: string) => Promise<void>;
}) {
  const [svgInput, setSvgInput] = useState(sampleSvg);
  const [componentName, setComponentName] = useState("Component name");
  const [activePanelTab, setActivePanelTab] =
    useState<ConverterPanelTab>("preview");
  const [isDraggingSvg, setIsDraggingSvg] = useState(false);

  const reactNativeConversion = useMemo(() => {
    return convertSvgToJsx(svgInput, componentName, "react-native");
  }, [componentName, svgInput]);
  const reactConversion = useMemo(() => {
    return convertSvgToJsx(svgInput, componentName, "react");
  }, [componentName, svgInput]);
  const activeCodeConversion =
    activePanelTab === "react" ? reactConversion : reactNativeConversion;
  const activeCodeLabel =
    activePanelTab === "react" ? "React JSX" : "React Native JSX";
  const editorTheme = githubLight;

  async function loadSvgFile(file: File) {
    const text = await file.text();
    setSvgInput(text);
  }

  function getDroppedSvgFile(dataTransfer: DataTransfer) {
    return Array.from(dataTransfer.files).find((file) => {
      return (
        file.type === "image/svg+xml" ||
        file.name.toLowerCase().endsWith(".svg")
      );
    });
  }

  return (
    <section
      className="converter-shell"
      aria-label="SVG converter"
    >
      <div className="converter-layout">
        <section
          className={
            isDraggingSvg
              ? "converter-card svg-drop-zone dragging"
              : "converter-card svg-drop-zone"
          }
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDraggingSvg(true);
          }}
          onDragLeave={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            ) {
              setIsDraggingSvg(false);
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setIsDraggingSvg(true);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDraggingSvg(false);

            const file = getDroppedSvgFile(event.dataTransfer);

            if (file) {
              void loadSvgFile(file);
            }
          }}
        >
          <div className="converter-card-header svg-input-header">
            <div className="svg-input-title">
              <h2>SVG Input</h2>
              <span>Drop .svg here</span>
            </div>
            <div className="component-name-inline">
              <input
                aria-label="Component name"
                value={componentName}
                onChange={(event) => setComponentName(event.target.value)}
                onFocus={(event) => event.target.select()}
                placeholder="Component name"
                type="text"
              />
            </div>
            <div className="svg-input-actions">
              <label className="file-upload-button">
                Upload SVG
                <input
                  accept=".svg,image/svg+xml"
                  type="file"
                  onChange={(event) => {
                    const file = event.target.files?.[0];

                    if (!file) {
                      return;
                    }

                    void loadSvgFile(file);
                    event.target.value = "";
                  }}
                />
              </label>
              <button type="button" onClick={() => setSvgInput("")}>
                Clear
              </button>
            </div>
          </div>
          <CodeMirror
            basicSetup={{
              autocompletion: false,
              bracketMatching: true,
              closeBrackets: true,
              foldGutter: false,
              highlightActiveLine: true,
              lineNumbers: true,
            }}
            className="code-editor"
            extensions={[xml()]}
            onChange={setSvgInput}
            placeholder="<svg ...>...</svg>"
            theme={editorTheme}
            value={svgInput}
          />
        </section>

        <section className="converter-card converter-result-card">
          <div className="converter-card-header" style={{ display: "flex" }}>
            <div
              className="converter-result-tabs"
              aria-label="Converted result views"
            >
              <button
                className={activePanelTab === "preview" ? "active" : undefined}
                type="button"
                onClick={() => setActivePanelTab("preview")}
              >
                Preview
              </button>
              <button
                className={
                  activePanelTab === "react-native" ? "active" : undefined
                }
                type="button"
                onClick={() => setActivePanelTab("react-native")}
              >
                React Native
              </button>
              <button
                className={activePanelTab === "react" ? "active" : undefined}
                type="button"
                onClick={() => setActivePanelTab("react")}
              >
                React
              </button>
            </div>
            {activePanelTab === "preview" ? null : (
              <button
                aria-label={`Copy ${activeCodeLabel}`}
                type="button"
                onClick={() =>
                  onCopy(activeCodeConversion.code, activeCodeLabel)
                }
                disabled={
                  !activeCodeConversion.code ||
                  Boolean(activeCodeConversion.error)
                }
              >
                ⧉
              </button>
            )}
          </div>
          {activePanelTab === "preview" ? (
            <>
              <div className="converter-preview">
                {reactNativeConversion.previewSvg ? (
                  <span
                    dangerouslySetInnerHTML={{
                      __html: reactNativeConversion.previewSvg,
                    }}
                  />
                ) : (
                  <span className="converter-placeholder">
                    Paste SVG to preview
                  </span>
                )}
              </div>
              {reactNativeConversion.error ? (
                <p className="converter-error" role="alert">
                  {reactNativeConversion.error}
                </p>
              ) : null}
            </>
          ) : (
            <CodeMirror
              basicSetup={{
                autocompletion: false,
                bracketMatching: true,
                closeBrackets: false,
                foldGutter: true,
                highlightActiveLine: true,
                lineNumbers: true,
              }}
              className="code-editor code-editor-readonly"
              editable={false}
              extensions={[javascript({ jsx: true, typescript: true })]}
              theme={editorTheme}
              value={
                activeCodeConversion.code ||
                "// Converted JSX will appear here."
              }
            />
          )}
        </section>
      </div>
    </section>
  );
}
