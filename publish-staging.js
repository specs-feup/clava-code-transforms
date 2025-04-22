import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = resolve(__dirname, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

const originalVersion = packageJson.version;

const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
const hours = String(now.getHours()).padStart(2, '0');
const minutes = String(now.getMinutes()).padStart(2, '0');
const seconds = String(now.getSeconds()).padStart(2, '0');
const timestamp = `${year}${month}${day}${hours}${minutes}.${seconds}`;
const stagingVersion = `${originalVersion}-staging.${timestamp}`;

packageJson.version = stagingVersion;
writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
console.log(`Updated version to ${stagingVersion}`);

execSync('npm run build', { stdio: 'inherit' });
execSync('npm publish --tag staging', { stdio: 'inherit' });

packageJson.version = originalVersion;
writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

console.log(`Reverted version back to ${originalVersion}`);
