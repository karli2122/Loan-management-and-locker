const { withMainApplication } = require('@expo/config-plugins');

const IMPORT_LINE = 'import com.eamilock.DeviceAdminPackage;';
const PACKAGE_INSTANCE = 'new DeviceAdminPackage()';

function addImport(contents) {
  if (contents.includes(IMPORT_LINE)) return contents;
  const packageDeclMatch = contents.match(/package [^;]+;\s*/);
  if (packageDeclMatch) {
    const insertPos = packageDeclMatch.index + packageDeclMatch[0].length;
    return (
      contents.slice(0, insertPos) +
      `\n${IMPORT_LINE}\n` +
      contents.slice(insertPos)
    );
  }
  return `${IMPORT_LINE}\n${contents}`;
}

function addPackage(contents) {
  if (contents.includes(PACKAGE_INSTANCE)) return contents;

  const packageListPattern =
    /List<ReactPackage>\s+packages\s*=\s*new PackageList\(this\)\.getPackages\(\);\s*/;

  if (packageListPattern.test(contents)) {
    return contents.replace(
      packageListPattern,
      (match) => `${match}    packages.add(new DeviceAdminPackage());\n    `
    );
  }

  // Fallback: insert before return packages;
  const returnPattern = /return\s+packages;/;
  if (returnPattern.test(contents)) {
    return contents.replace(
      returnPattern,
      'packages.add(new DeviceAdminPackage());\n        return packages;'
    );
  }

  return contents;
}

module.exports = function withDeviceAdminPackageRegistration(config) {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;
    contents = addImport(contents);
    contents = addPackage(contents);
    config.modResults.contents = contents;
    return config;
  });
};
