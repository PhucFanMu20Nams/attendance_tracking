/**
 * Database Configuration Module
 * 
 * Handles MongoDB connection settings and transaction capabilities detection.
 * Provides utilities for determining if MongoDB is running as a replica set,
 * which is required for multi-document transactions.
 * 
 * Environment Variables:
 * - MONGODB_REPLICA_SET: Explicit flag ('true'/'false') to enable/disable transactions
 * - MONGODB_URI: Connection string (parsed to detect replicaSet parameter)
 * - NODE_ENV: Production assumes replica set availability
 */

/**
 * Check if MongoDB replica set is available for transactions
 * 
 * MongoDB transactions require a replica set or sharded cluster.
 * Standalone MongoDB instances do not support transactions.
 * 
 * Detection Methods (in order of priority):
 * 1. Explicit MONGODB_REPLICA_SET environment variable
 * 2. Parse connection string for replicaSet parameter
 * 3. Assume replica set in production environment
 * 4. Default to standalone (no transactions)
 * 
 * @returns {boolean} True if transactions are available, false otherwise
 */
export const isReplicaSetAvailable = () => {
  // Method 1: Explicit configuration takes precedence
  const explicitFlag = process.env.MONGODB_REPLICA_SET;
  if (explicitFlag === 'true') {
    return true;
  }
  if (explicitFlag === 'false') {
    return false;
  }

  // Method 2: Parse connection string for replicaSet parameter
  const uri = process.env.MONGODB_URI || '';
  
  // Atlas (mongodb+srv) almost always has replica set
  if (uri.startsWith('mongodb+srv://')) {
    console.info('ℹ️  Detected MongoDB Atlas URI (mongodb+srv), enabling transactions');
    return true;
  }
  
  // Explicit replicaSet parameter in connection string
  if (uri.includes('replicaSet=')) {
    console.info('ℹ️  Detected replicaSet parameter in URI, enabling transactions');
    return true;
  }

  // Method 3: Production warning (no auto-assume for safety)
  // If running in production without explicit config, warn but default to safe mode
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '⚠️  PRODUCTION WARNING: MONGODB_REPLICA_SET environment variable not explicitly set!\n' +
      '   Defaulting to standalone mode (transactions disabled).\n' +
      '   If your MongoDB is a replica set or Atlas cluster, set MONGODB_REPLICA_SET=true\n' +
      '   to enable atomic transactions for approve/reject operations.'
    );
  }

  // Method 4: Default to standalone for safety (development/testing)
  return false;
};

/**
 * Get database connection options based on environment
 * 
 * @returns {Object} MongoDB connection options
 */
export const getConnectionOptions = () => {
  const options = {
    // Recommended settings for production
    maxPoolSize: 10,
    minPoolSize: 2,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 5000,
  };

  return options;
};

/**
 * Transaction options for session.withTransaction()
 * 
 * These options ensure strong consistency and durability for transactions:
 * - snapshot: Reads see consistent snapshot of data
 * - majority: Writes acknowledged by majority of replica set
 * - primary: Reads from primary node only
 * 
 * @returns {Object} MongoDB transaction options
 */
export const getTransactionOptions = () => {
  return {
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' },
    readPreference: 'primary'
  };
};
