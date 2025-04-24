import fs from "fs";
import path from "path";

const filePath = path.join(
  __dirname,
  "..",
  "metadata",
  `${process.env.HARDHAT_NETWORK || "metadata"}.json`
);

interface Metadata {
  [key: string]: string;
}

function readMetadataFile(): Metadata {
  try {
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // File doesn't exist, return an empty object
      return {};
    }
    throw error;
  }
}

function writeMetadataFile(data: Metadata): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function readMetadata(key: string): string {
  const metadata = readMetadataFile();
  return metadata[key];
}

export function writeMetadata(key: string, value: string): void {
  const metadata = readMetadataFile();
  metadata[key] = value;
  writeMetadataFile(metadata);
}

export function addressFor(name: string): string {
  const address = readMetadata(name);
  if (!address) {
    throw new Error(`Address not found in metadata for ${name}`);
  }
  return address;
}
