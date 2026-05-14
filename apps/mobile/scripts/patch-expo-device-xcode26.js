const fs = require("fs");
const path = require("path");

function findExpoDeviceSwiftFile() {
  const packageJsonPath = require.resolve("expo-device/package.json", {
    paths: [process.cwd(), __dirname],
  });
  return path.join(path.dirname(packageJsonPath), "ios", "UIDevice.swift");
}

const swiftFile = findExpoDeviceSwiftFile();
const source = fs.readFileSync(swiftFile, "utf8");

if (source.includes("#if targetEnvironment(simulator)")) {
  process.stdout.write("expo-device Xcode 26 patch already applied\n");
  process.exit(0);
}

const patched = source.replace(
  /var isSimulator: Bool \{\s*return TARGET_OS_SIMULATOR != 0\s*\}/m,
  `var isSimulator: Bool {
    #if targetEnvironment(simulator)
    return true
    #else
    return false
    #endif
  }`
);

if (patched === source) {
  throw new Error(`Could not patch expo-device UIDevice.swift at ${swiftFile}`);
}

fs.writeFileSync(swiftFile, patched);
process.stdout.write("patched expo-device UIDevice.swift for Xcode 26\n");
