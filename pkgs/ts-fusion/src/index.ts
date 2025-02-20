import { Project, TypeFormatFlags } from "ts-morph";
import crc from "crc/crc32";
import handlebars from "handlebars";

import virtualSourceTpl from "./templates/virtual-source.hbs";

type FileOpt = {
  path: string;
  types?: Array<string>;
};

type FileMap = Record<
  string, // file path, as in files
  string // file types, fusioned
>;

export default async (
  tsConfigFilePathOrProject: string | Project,
  files: Array<string | FileOpt>,
  opts?: {
    include?: Array<string>;
  },
): Promise<FileMap> => {
  const project =
    typeof tsConfigFilePathOrProject === "string"
      ? new Project({
          tsConfigFilePath: tsConfigFilePathOrProject,
          skipAddingFilesFromTsConfig: true,
        })
      : tsConfigFilePathOrProject;

  for (const file of opts?.include || []) {
    project.addSourceFileAtPath(file);
  }

  const createVirtualSourceFile = (file: FileOpt) => {
    const sourceFile =
      project.getSourceFile(file.path) || // in case file already added
      project.addSourceFileAtPath(file.path);

    const sourceTypes = sourceFile.getTypeAliases().flatMap((e) => {
      if (!e.isExported()) {
        return [];
      }
      const name = e.getName();
      return !file.types || file.types.includes?.(name) ? [{ name }] : [];
    });

    const virtualSourceCode = render<{
      sourceFile: string;
      discriminationKey: string;
      sourceTypes: Array<{ name: string }>;
    }>(virtualSourceTpl, {
      sourceFile: file.path.replace(/\.ts$/, ""),
      discriminationKey: `@[${crc(JSON.stringify(file))}]`,
      sourceTypes,
    });

    return project.createSourceFile(
      `./__${crc(file.path + virtualSourceCode)}__.ts`,
      virtualSourceCode,
    );
  };

  const fileMap: FileMap = {};

  for (const file of files.map((e) => {
    return typeof e === "string" ? { path: e } : e;
  })) {
    const sourceFile = createVirtualSourceFile(file);

    const sourceTypes = sourceFile
      .getTypeAliases()
      .filter((e) => e.isExported());

    const outFile = project.createSourceFile(
      `./__${crc(file.path + sourceTypes.map((e) => e.getName()).join(":"))}__.ts`,
    );

    for (const sourceType of sourceTypes) {
      //
      const compiledType = sourceType
        .getType()
        .getText(
          undefined,
          TypeFormatFlags.NoTruncation |
            TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
        );

      outFile.addTypeAlias({
        name: sourceType.getName(),
        isExported: sourceType.isExported(),
        isDefaultExport: sourceType.isDefaultExport(),
        hasDeclareKeyword: sourceType.hasDeclareKeyword(),
        type: compiledType,
      });
    }

    const compiledTypes = outFile.getText();

    // cleanup
    for (const file of [sourceFile, outFile]) {
      project.removeSourceFile(file);
    }

    fileMap[file.path] = compiledTypes;
  }

  return fileMap;
};

const render = <Context = object>(
  template: string,
  context: Context,
  options?: { noEscape?: boolean },
): string => {
  const { noEscape = true } = { ...options };
  return handlebars.compile(template, { noEscape })(context);
};
