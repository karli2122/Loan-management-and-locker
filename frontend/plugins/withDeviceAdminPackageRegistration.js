const { withMainApplication } = require('@expo/config-plugins');

/**
 * This plugin adds the DeviceAdminPackage to the MainApplication's getPackages() method.
 */
function withDeviceAdminPackageRegistration(config) {
  return withMainApplication(config, (config) => {
    const mainApplication = config.modResults;
    
    // Add import for DeviceAdminPackage
    const importStatement = 'import com.eamilock.DeviceAdminPackage;';
    
    if (!mainApplication.contents.includes(importStatement)) {
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
    
    // Add DeviceAdminPackage to getPackages()
    const packageInstance = 'new DeviceAdminPackage()';
    
    if (!mainApplication.contents.includes(packageInstance)) {
      // Find the getPackages() method and add our package
      // Look for the packages.add or the return statement in getPackages
      const getPackagesMatch = mainApplication.contents.match(/protected\s+List<ReactPackage>\s+getPackages\(\)\s*\{[\s\S]*?return\s+packages;/);
      
      if (getPackagesMatch) {
        const matchText = getPackagesMatch[0];
        const insertPoint = matchText.lastIndexOf('return packages;');
        const newMatchText = 
          matchText.substring(0, insertPoint) + 
          'packages.add(new DeviceAdminPackage());\n      ' +
          matchText.substring(insertPoint);
        
        mainApplication.contents = mainApplication.contents.replace(matchText, newMatchText);
      }
    }
    
    return config;
  });
}

module.exports = withDeviceAdminPackageRegistration;
