const path = require("path");
const parser = require("@babel/parser");
const t = require("@babel/types");
const { default: traverse } = require("@babel/traverse");
const { default: generate } = require("@babel/generator");
const resolve = require("../resolve");

const root = process.cwd();
function toModuleId(filePath) {
  return "/" + path.relative(root, filePath);
}

module.exports = (file) => {
  const context = path.dirname(file.path);
  const deps = new Set();
  const asyncDeps = new Set();

  function resolveDep(resource, async = false) {
    const filePath = resource.startsWith(".") // TODO: not sure about this
      ? resolve(path.join(context, resource)) // relative import
      : resolve(path.join(root, "node_modules", resource)); // node module
    (async ? asyncDeps : deps).add(filePath);
    return toModuleId(filePath);
  }

  const ast = parser.parse(file.content, {
    sourceType: "module",
    plugins: ["jsx", "classProperties"],
  });
  traverse(ast, {
    CallExpression({ node }) {
      if (t.isIdentifier(node.callee) && node.callee.name === "require") {
        // CommonJS `require`
        if (t.isStringLiteral(node.arguments[0])) {
          node.arguments[0].value = resolveDep(node.arguments[0].value);
        }
      } else if (t.isImport(node.callee)) {
        // dynamic `import`
        node.callee = t.identifier("dynamicImport");
        if (t.isStringLiteral(node.arguments[0])) {
          node.arguments[0].value = resolveDep(node.arguments[0].value, true);
        }
      }
    },
  });
  const result = generate(ast);

  return {
    ...file,
    moduleId: toModuleId(file.path),
    content: result.code,
    deps,
    asyncDeps,
  };
};
