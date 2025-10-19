export class Logger {
  constructor(saveLog = false) {
    this.logs = saveLog ? [] : null;
  }

  log(message, emoji = '') {
    const line = emoji ? `${emoji} ${message}` : message;
    console.log(line);
    if (this.logs) {
      this.logs.push(`${new Date().toISOString()} - ${line}`);
    }
  }

  async saveLogs(filename) {
    if (this.logs) {
      const fs = await import('fs/promises');
      await fs.writeFile(filename, this.logs.join('\n'));
    }
  }
}