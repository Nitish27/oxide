import Editor from '@monaco-editor/react';

interface SQLEditorProps {
  value: string;
  onChange: (value: string | undefined) => void;
  onRun?: (selectedText?: string) => void;
  onRunAll?: () => void;
  onCancel?: () => void;
}

export const SQLEditor = ({ value, onChange, onRun, onRunAll, onCancel }: SQLEditorProps) => {
  return (
    <div className="h-full w-full">
      <Editor
        height="100%"
        defaultLanguage="sql"
        theme="vs-dark"
        value={value}
        onChange={onChange}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', monospace",
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          padding: { top: 10, bottom: 10 },
          wordWrap: 'on',
        }}
        onMount={(editor, monaco) => {
          // ⌘+Return or Ctrl+Return: Run Current/Selected
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
            const selection = editor.getSelection();
            const selectedText = selection ? editor.getModel()?.getValueInRange(selection) : undefined;
            onRun?.(selectedText);
          });

          // ⌘+⇧+Return or Ctrl+Shift+Return: Run All
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
            onRunAll?.();
          });

          // ⌘+. or Ctrl+.: Cancel Query
          // Note: monaco.KeyCode.Period is used for '.'
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Period, () => {
            onCancel?.();
          });
        }}
      />
    </div>
  );
};
