import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const moduleCache = new Map();

const resolveDependency = (fromPath, specifier) => {
  if (!specifier.startsWith(".")) {
    throw new Error(`Unsupported TypeScript test dependency: ${specifier}`);
  }
  const unresolved = path.resolve(path.dirname(fromPath), specifier);
  return path.extname(unresolved) ? unresolved : `${unresolved}.ts`;
};

const dependencySpecifiers = (sourcePath, sourceText) => {
  const source = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    sourcePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  return source.statements.flatMap((statement) => {
    if (
      (ts.isImportDeclaration(statement) ||
        ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      return [statement.moduleSpecifier.text];
    }
    return [];
  });
};

const loadAbsoluteModule = async (sourcePath) => {
  const normalizedPath = path.normalize(sourcePath);
  if (moduleCache.has(normalizedPath)) return moduleCache.get(normalizedPath);

  const pending = (async () => {
    const sourceText = await readFile(normalizedPath, "utf8");
    const dependencies = {};
    for (const specifier of dependencySpecifiers(normalizedPath, sourceText)) {
      if (!specifier.startsWith(".")) continue;
      dependencies[specifier] = await loadAbsoluteModule(
        resolveDependency(normalizedPath, specifier),
      );
    }
    const compiled = ts.transpileModule(sourceText, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: normalizedPath,
    }).outputText;
    const module = { exports: {} };
    const require = (specifier) => {
      if (!(specifier in dependencies)) {
        throw new Error(
          `Unexpected dependency in ${normalizedPath}: ${specifier}`,
        );
      }
      return dependencies[specifier];
    };
    Function("module", "exports", "require", compiled)(
      module,
      module.exports,
      require,
    );
    return module.exports;
  })();

  moduleCache.set(normalizedPath, pending);
  return pending;
};

export const loadTypescriptModule = (relativePath) =>
  loadAbsoluteModule(path.resolve(repositoryRoot, relativePath));
