const helpSections = [
  {
    title: "Dataset",
    commands: [
      {
        command: "dataset-new <name> columns=<col[:type][,col[:type]...]> rows=<n>",
        description:
          "Create a dataset from scratch with typed columns and empty rows. The dataset is also registered as ~/raw/<name>.csv.",
        example: "dataset-new calc columns=x:number,label:string rows=10",
      },
      {
        command: "dataset-calc <dataset> column=<newOrExistingCol> expr=<expression>",
        description:
          "Evaluate a numeric expression row by row and write it to a new or existing column. Supports +, -, *, /, parentheses, scalars, and column references.",
        example: 'dataset-calc waveform.csv column=sum expr="signal + background"',
      },
      {
        command: "lsdata",
        description: "List loaded datasets, row counts, and column names.",
        example: "lsdata",
      },
    ],
  },
  {
    title: "Table",
    commands: [
      {
        command: "table <dataset> columns=<column[,column...]>",
        description:
          "Open a table window for a dataset. Optional columns limit the visible fields.",
        example: "table waveform.csv columns=time,signal",
      },
      {
        command:
          "table-edit <dataset> action=<set-cell|delete-row|delete-column|insert-column> ...",
        description:
          "Edit cells, delete rows or columns, or insert a new column. Row indexes are 1-based in commands.",
        example: "table-edit waveform.csv action=insert-column column=fit before=signal",
      },
      {
        command: "table-range <dataset> action=<clear|fill-down> r1=<n> c1=<col> r2=<n> c2=<col>",
        description: "Apply a destructive operation to a selected rectangular cell range.",
        example: "table-range waveform.csv action=fill-down r1=1 c1=signal r2=10 c2=signal",
      },
    ],
  },
  {
    title: "Plot",
    commands: [
      {
        command: "plot <dataset> x=<column> y=<column[,column...]> type=<line|line-marker|marker>",
        description: "Create a graph from one X column and one or more Y series.",
        example: "plot waveform.csv x=time y=signal,background type=line",
      },
      {
        command: "plot-set <plotId> title=<title> type=<...> width=<n> height=<n>",
        description: "Update plot title, appearance, border, size, font, and padding.",
        example: 'plot-set plot-abc title="Signal vs time" width=720 height=420',
      },
      {
        command: "plot-axis <plotId> axis=<x|y> range=<auto|min:max> tick=<auto|interval>",
        description:
          "Configure axis range, tick interval and direction, scale, labels, and colors.",
        example: "plot-axis plot-abc axis=x range=0:10 tick=1",
      },
      {
        command: "plot-grid <plotId> x=<true|false> y=<true|false>",
        description: "Show or hide X/Y major grid lines.",
        example: "plot-grid plot-abc x=true y=false",
      },
      {
        command: "plot-series <plotId> y=<column> action=<add|remove>",
        description:
          "Add, remove, or restyle a Y series. Style options include label, color, lineWidth, markerSize, markerShape, and order.",
        example: "plot-series plot-abc y=background action=add",
      },
      {
        command: "plot-annotation <plotId> action=<add|update|remove>",
        description: "Manage text-arrow annotations attached to a plot.",
        example: 'plot-annotation plot-abc action=add type=text-arrow text="Peak" x=1 y=2',
      },
      {
        command: "plot-schema [plotId]",
        description: "Print the current plot JSON schema for reproducible graph settings.",
        example: "plot-schema plot-abc",
      },
      {
        command: "plot-apply-schema <plotId> json=<encodedJson>",
        description:
          "Apply a plot-schema JSON document to an existing plot after validating the source dataset and columns.",
        example: "plot-apply-schema plot-abc json=%7B...%7D",
      },
    ],
  },
  {
    title: "Files and Import",
    commands: [
      {
        command: "file-list [path]",
        description: "List virtual filesystem entries and dataset-backed files.",
        example: "file-list ~/raw",
      },
      {
        command: "file-mkdir <path>",
        description: "Create a virtual directory under ~/raw.",
        example: "file-mkdir ~/raw/analysis",
      },
      {
        command: "file-rename <path> name=<newName>",
        description: "Rename a virtual file, directory, or dataset-backed raw file.",
        example: "file-rename ~/raw/data.csv name=renamed.csv",
      },
      {
        command: "file-move <path> to=<directory>",
        description: "Move a virtual file or directory to another virtual directory.",
        example: "file-move ~/raw/data.csv to=~/raw/analysis",
      },
      {
        command: "file-delete <path>",
        description: "Delete a virtual file or directory and clean up dependent windows.",
        example: "file-delete ~/raw/data.csv",
      },
      {
        command: "upload-open <uploadId> name=<fileName> ref=<uploadId> mode=<tabular|raw>",
        description:
          "Open an upload payload in the Import window without embedding large text in history.",
        example: "upload-open upload-123 name=data.csv ref=upload-123 mode=tabular",
      },
      {
        command: "import-open <importId> name=<fileName> text=<encodedText>",
        description: "Open an Import window from encoded raw text.",
        example: "import-open import-123 name=data.csv text=x%2Cy%0A1%2C2",
      },
      {
        command: "import-preview <importId>",
        description: "Re-parse a pending import and return the current preview state.",
        example: "import-preview import-123",
      },
      {
        command: "import-set <importId> skipRows=<n> delimiter=<...> hasHeader=<true|false>",
        description: "Adjust import parsing options before confirming the dataset.",
        example: "import-set import-123 skipRows=1 delimiter=tab hasHeader=true",
      },
      {
        command: "import-column <importId> column=<col> action=<include|exclude>",
        description: "Include or exclude a parsed preview column before import confirmation.",
        example: "import-column import-123 column=blank_1 action=exclude",
      },
      {
        command: "import-line <importId> line=<n> value=<text>",
        description: "Edit one raw-text preview line before parsing or confirming.",
        example: "import-line import-123 line=2 value=time,signal",
      },
      {
        command: "import-cancel <importId>",
        description: "Close a pending Import window without saving a file or dataset.",
        example: "import-cancel import-123",
      },
      {
        command: "import-confirm <importId> mode=<tabular|raw> path=<virtualPath>",
        description:
          "Persist a pending import into ~/raw and create a dataset when parsing succeeds.",
        example: "import-confirm import-123 mode=tabular path=~/raw/data.csv",
      },
      {
        command: "elt <dataset> as <newName>",
        description: "Create a derived dataset copy under a new name.",
        example: "elt waveform.csv as waveform_copy.csv",
      },
    ],
  },
  {
    title: "REPL and Safety",
    commands: [
      {
        command: "help",
        description: "Print compact command help in the terminal.",
        example: "help",
      },
      {
        command: "clear",
        description:
          "Clear the terminal display and scrollback while staying in the SciSpace REPL.",
        example: "clear",
      },
      {
        command: "pwd / cd / ls / cat",
        description:
          "Inspect the safe virtual filesystem from the REPL. These commands never leave SciSpace.",
        example: "cd ~/raw && ls",
      },
      {
        command: "repl",
        description: "Return to the SciSpace REPL prompt from unsafe shell mode.",
        example: "scispace repl",
      },
      {
        command: "unsafe on|off",
        description: "Enable or disable access to the unsafe just-bash shell.",
        example: "unsafe on",
      },
      {
        command: "shell",
        description: "Enter unsafe just-bash shell only after unsafe mode is enabled.",
        example: "shell",
      },
    ],
  },
  {
    title: "Keyboard Shortcuts",
    commands: [
      {
        command: "Tab",
        description: "Complete SciSpace REPL command names when the cursor is at the line end.",
        example: "plot<Tab>",
      },
      {
        command: "Ctrl+K",
        description: "Delete text from the terminal cursor to the end of the current line.",
        example: "dataset-calc ... <Ctrl+K>",
      },
      {
        command: "Alt+Left / Alt+Right",
        description: "Move the terminal cursor by space-delimited words.",
        example: "plot waveform.csv x=time y=signal",
      },
    ],
  },
];

export function ScispaceHelpWindow() {
  return (
    <div className="scispace-help-window">
      <header className="help-window-header">
        <h2>scispace command help</h2>
        <p>Commands run in the SciSpace REPL and are also used by GUI operations.</p>
      </header>
      <div className="help-section-list">
        {helpSections.map((section) => (
          <section key={section.title} className="help-section">
            <h3>{section.title}</h3>
            {section.commands.map((command) => (
              <article key={command.command} className="help-command-card">
                <code>{command.command}</code>
                <p>{command.description}</p>
                <pre>{command.example}</pre>
              </article>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
