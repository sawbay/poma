import { clientTools as cTools } from "./client";
import { bitcoinBalance, ethereumBalance, solanaBalance } from "./balance";

export const clientTools = cTools;

export const tools = {
  bitcoinBalance,
  ethereumBalance,
  solanaBalance
};

/**
 * Implementation of confirmation-required tools
 * This object contains the actual logic for tools that need human approval
 * Each function here corresponds to a tool above that doesn't have an execute function
 */
export const executions = {
  // getWeatherInformation: async ({ city }: { city: string }) => {
  //   console.log(`Getting weather information for ${city}`);
  //   return `The weather in ${city} is sunny`;
  // }
};
