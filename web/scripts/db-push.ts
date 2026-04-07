import { config } from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

config({ path: '.env.local' });

async function push() {
  try {
    const { stdout, stderr } = await execPromise('npx prisma db push --accept-data-loss');
    console.log(stdout);
    if (stderr) console.error(stderr);
  } catch (error: any) {
    console.error(error.stdout || error.stderr || error.message);
    process.exit(1);
  }
}

push();
