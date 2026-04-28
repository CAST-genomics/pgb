export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
}

export function timestampedFilename(layer: string, extension: string): string {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const stamp =
        `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
        `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    return `pgb-${layer}-${stamp}.${extension}`
}
