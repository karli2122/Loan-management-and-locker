const { withMainApplication } = require('@expo/config-plugins');

function getPackageName(config) {
  return (
    config?.android?.package ||
    config?.expo?.android?.package ||
    config?.modResults?.android?.package ||
    'com.eamilock'
  );
}

function addImport(contents, importLine) {
  if (contents.includes(importLine)) return contents;
  const packageDeclMatch = contents.match(/package\s+[^\n;]+[^\n]*\n/);
  if (packageDeclMatch) {
    const insertPos = packageDeclMatch.index + packageDeclMatch[0].length;
    return (
      contents.slice(0, insertPos) +
      `${importLine}\n` +
      contents.slice(insertPos)
    );
  }
  return `${importLine}\n${contents}`;
}

function addPackage(contents, { kotlinInstance, javaInstance }) {
  if (
    contents.includes(javaInstance) ||
    contents.includes(kotlinInstance)
  )
    return contents;

  const kotlinApplyPattern =
    /^(\s*)PackageList\(this\)\.packages\.apply\s*\{\s*$/m;
  if (kotlinApplyPattern.test(contents)) {
    return contents.replace(
      kotlinApplyPattern,
      (fullLine, indent) => `${fullLine}\n${indent}  add(${kotlinInstance})`
    );
  }

  // Kotlin: val packages = PackageList(this).packages
  const kotlinPackagesPattern =
    /val\s+packages\s*=\s*PackageList\(this\)\.packages/;
  if (kotlinPackagesPattern.test(contents)) {
    return contents.replace(
      kotlinPackagesPattern,
      `val packages = PackageList(this).packages.toMutableList()\n        packages.add(${kotlinInstance})`
    );
  }

  const packageListPattern =
    /List<ReactPackage>\s+packages\s*=\s*new PackageList\(this\)\.getPackages\(\);\s*/;

  if (packageListPattern.test(contents)) {
    return contents.replace(
      packageListPattern,
      (match) => `${match}    packages.add(${javaInstance});\n    `
    );
  }

  // Fallback: insert before return packages;
  const returnPattern = /return\s+packages;/;
  if (returnPattern.test(contents)) {
    return contents.replace(
      returnPattern,
      `packages.add(${javaInstance});\n        return packages;`
    );
  }

  return contents;
}

module.exports = function withDevicePolicyPackageRegistration(config) {
  const packageName = getPackageName(config);
  const importLine = `import ${packageName}.DevicePolicyPackage;`;
  const instances = {
    javaInstance: 'new DevicePolicyPackage()',
    kotlinInstance: 'DevicePolicyPackage()',
  };
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;
    contents = addImport(contents, importLine);
    contents = addPackage(contents, instances);
    config.modResults.contents = contents;
    return config;
  });
};
