import { useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { githubLight } from "@uiw/codemirror-theme-github";
import { javascript } from "@codemirror/lang-javascript";
import { xml } from "@codemirror/lang-xml";
import {
  convertSvgToJsx,
  sampleSvg,
  type SvgConverterTarget,
} from "./converter";

export function SvgToReactNativeConverter({
  onCopy,
}: {
  onCopy: (value: string, label: string) => Promise<void>;
}) {
  const [svgInput, setSvgInput] = useState(sampleSvg);
  const [componentName, setComponentName] = useState("ConvertedIcon");
  const [target, setTarget] = useState<SvgConverterTarget>("react-native");

  const conversion = useMemo(() => {
    return convertSvgToJsx(svgInput, componentName, target);
  }, [componentName, svgInput, target]);
  const outputLabel = target === "react-native" ? "React Native JSX" : "React JSX";
  const editorTheme = githubLight;

  return (
    <section className="converter-shell" aria-label="SVG to React Native JSX converter">
      <div className="converter-toolbar">
        <label>
          <span>Component name</span>
          <input
            value={componentName}
            onChange={(event) => setComponentName(event.target.value)}
            placeholder="ConvertedIcon"
            type="text"
          />
        </label>
        <label>
          <span>Output target</span>
          <select
            value={target}
            onChange={(event) => setTarget(event.target.value as SvgConverterTarget)}
          >
            <option value="react-native">React Native</option>
            <option value="react">React</option>
          </select>
        </label>
        <label className="file-upload-button">
          Upload
          <input
            accept=".svg,image/svg+xml"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (!file) {
                return;
              }

              void file.text().then(setSvgInput);
              event.target.value = "";
            }}
          />
        </label>
        <button type="button" onClick={() => setSvgInput("")}>
          Clear
        </button>
        <button type="button" onClick={() => setSvgInput(sampleSvg)}>
          Sample
        </button>
      </div>

      <div className="converter-layout">
        <section className="converter-card">
          <div className="converter-card-header">
            <h2>SVG Input</h2>
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
            height="430px"
            onChange={setSvgInput}
            placeholder="<svg ...>...</svg>"
            theme={editorTheme}
            value={svgInput}
          />
        </section>

        <section className="converter-card converter-preview-card">
          <div className="converter-card-header">
            <h2>Preview</h2>
          </div>
          <div className="converter-preview">
            {conversion.previewSvg ? (
              <span dangerouslySetInnerHTML={{ __html: conversion.previewSvg }} />
            ) : (
              <span className="converter-placeholder">Paste SVG to preview</span>
            )}
          </div>
          {conversion.error ? (
            <p className="converter-error" role="alert">
              {conversion.error}
            </p>
          ) : null}
        </section>

        <section className="converter-card converter-output-card">
          <div className="converter-card-header">
            <h2>{outputLabel}</h2>
            <button
              aria-label={`Copy ${outputLabel}`}
              type="button"
              onClick={() => onCopy(conversion.code, outputLabel)}
              disabled={!conversion.code || Boolean(conversion.error)}
            >
              ⧉
            </button>
          </div>
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
            height="430px"
            theme={editorTheme}
            value={conversion.code || "// Converted JSX will appear here."}
          />
        </section>
      </div>
    </section>
  );
}
