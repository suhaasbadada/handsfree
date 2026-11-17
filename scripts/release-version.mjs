// Mac distribution policy: canonical stable or numbered beta, no build metadata.
export function releaseVersion(version) {
  if (typeof version !== 'string' || version !== version.trim() || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-beta\.[1-9]\d*)?$/.test(version)) {
    throw new Error('Expected a canonical stable or numbered beta distribution version without build metadata');
  }
  return { version, prerelease: version.includes('-') };
}
