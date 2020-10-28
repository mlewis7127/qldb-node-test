/*
 * Lambda function that implements the create licence functionality
 */
const Log = require('@dazn/lambda-powertools-logger');
const { QldbDriver } = require('amazon-qldb-driver-nodejs');
const qldbDriver = new QldbDriver(process.env.LEDGER_NAME);

module.exports.handler = async (event) => {
  const {
    email
  } = JSON.parse(event.body);
  Log.debug(`In the create licence handler with: email ${email}`);

  try {
    console.log('About to call out to create licence');
    const response = await createLicence(
      email
    );
    console.log('retrieved the response back from createLicence');
    return {
      statusCode: 201,
      body: JSON.stringify(response),
    };
  } catch (error) {
    Log.error(`Error returned: ${error}`);
    const errorBody = {
      status: 500,
      title: error.name,
      detail: error.message,
    };
    return {
      statusCode: 500,
      body: JSON.stringify(errorBody),
    };
  }
};


const createLicence = async (email) => {
  
    let licence;
    await qldbDriver.executeLambda(async (txn) => {
      // Check if the record already exists assuming email unique for demo
      const recordsReturned = await checkEmailUnique(txn, email);
      if (recordsReturned === 0) {
        const licenceDoc = [{
          email
        }];
        // Create the record. This returns the unique document ID in an array as the result set
        const result = await createBicycleLicence(txn, licenceDoc);
        const docIdArray = result.getResultList();
        const docId = docIdArray[0].get('documentId').stringValue();
        // Update the record to add the document ID as the GUID in the payload
        await addGuid(txn, docId, email);
        console.log('Create the licence doc to return');
        licence = {
          licenceId: docId,
          email
        };
      } else {
        throw new Error(`Licence record with email ${email} already exists. No new record created`);
      }
    }, () => Log.info('Retrying due to OCC conflict...'));
    return licence;
  };

  async function checkEmailUnique(txn, email) {
    Log.debug('In checkEmailUnique function');
    const query = 'SELECT email FROM BicycleLicence AS b WHERE b.email = ?';
    let recordsReturned;
    await txn.execute(query, email).then((result) => {
      recordsReturned = result.getResultList().length;
      if (recordsReturned === 0) {
        Log.debug(`No records found for ${email}`);
      } else {
        Log.debug(`Record already exists for ${email}`);
      }
    });
    return recordsReturned;
  }

  async function createBicycleLicence(txn, licenceDoc) {
    Log.debug('In the createBicycleLicence function');
    const statement = 'INSERT INTO BicycleLicence ?';
    return txn.execute(statement, licenceDoc);
  }
  
  async function addGuid(txn, docId, email) {
    Log.debug(`In the addGuid function with docId ${docId} and email ${email}`);
    const statement = 'UPDATE BicycleLicence as b SET b.licenceId = ? WHERE b.email = ?';
    return txn.execute(statement, docId, email);
  }
