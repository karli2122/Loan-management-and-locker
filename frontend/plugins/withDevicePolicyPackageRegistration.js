const { withMainApplication } = require('@expo/config-plugins');

/**
 * This plugin adds the DevicePolicyPackage to the MainApplication's getPackages() method.
 * It uses the app's package name dynamically.
 */
function withDevicePolicyPackageRegistration(config) {
  return withMainApplication(config, (config) => {
    const mainApplication = config.modResults;
    const packageName = config.android?.package || 'com.emi.client';
    
    // Add import for DevicePolicyPackage using the app's package name
    const importStatement = `import ${packageName}.DevicePolicyPackage;`;
    
    if (!mainApplication.contents.includes(importStatement) && !mainApplication.contents.includes('DevicePolicyPackage')) {
      // Find the last import statement and add our import after it
      const importIndex = mainApplication.contents.lastIndexOf('import ');
      const importEndIndex = mainApplication.contents.indexOf(';', importIndex);
      
      if (importIndex !== -1 && importEndIndex !== -1) {
        mainApplication.contents = 
          mainApplication.contents.substring(0, importEndIndex + 1) + 
          '\n' + importStatement +
          mainApplication.contents.substring(importEndIndex + 1);
      }
    }
    
    // Add DevicePolicyPackage to getPackages()
    const packageInstance = 'new DevicePolicyPackage()';
    
    if (!mainApplication.contents.includes(packageInstance)) {
      // Find the getPackages() method and add our package
      const getPackagesMatch = mainApplication.contents.match(/protected\s+List<ReactPackage>\s+getPackages\(\)\s*\{[\s\S]*?return\s+packages;/);
      
      if (getPackagesMatch) {
        const matchText = getPackagesMatch[0];
        const insertPoint = matchText.lastIndexOf('return packages;');
        const newMatchText = 
          matchText.substring(0, insertPoint) + 
          'packages.add(new DevicePolicyPackage());\n      ' +
          matchText.substring(insertPoint);
        
        mainApplication.contents = mainApplication.contents.replace(matchText, newMatchText);
      }
    }
    
    return config;
  });
}

module.exports = withDevicePolicyPackageRegistration;
