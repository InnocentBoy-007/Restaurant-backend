import mongoose from 'mongoose';
import AdminModel from '../model/adminModel.js'
import OrderDetails from '../model/orderDetailsModel.js'
import bcryt from 'bcrypt'
import { CustomError } from '../components/CustomError.js';
import { SentMail } from '../components/SentMail.js';

/**
 * Inside AdminService
 * // adminSignUp (sign up feature for admins)
 * // adminSignIn (sign in feature for admins)
 * // adminAcceptOrder (feature for admins to accept the placed orders)
 * // adminRejectOrder (feature for admins to reject the placed orders)
 */

export class AdminService {
    constructor() {
        this.adminDetails = null; // creating an instance variable so that it is avaible to all the methods
        this.otp = null;
        this.mailer = new SentMail();
    }

    // (test passed)
    async adminSignUp(adminDetails) { // adminDetails is a req body
        if (!adminDetails || typeof adminDetails !== 'object') {
            throw new CustomError("All fields required!(Bad Request) - backend", 400); // throws a custom error in case the req body is not provided fully or the provided req body is not an object
        }
        try {
            const isDuplicate = await AdminModel.findOne({ adminName: adminDetails.adminName }); //check if there's any duplicate account in the database
            if (isDuplicate) throw new CustomError("Account already exist!(conflict error) - backend", 409);

            this.adminDetails = adminDetails; // assigning all the req bodies to the instance variable

            const generateOTP = Math.floor(100000 + Math.random() * 900000).toString(); // generate otp
            this.otp = generateOTP;

            const receiverInfo = { // (object)
                to: adminDetails.adminEmail,
                subject: "OTP confirmation",
                text: `Use this OTP for the signup process ${this.otp}. Thanks from Innocent Team.`
            }
            await this.mailer.setUp();
            await this.mailer.sentMail(receiverInfo.to, receiverInfo.subject, receiverInfo.text); // otp will be sent to the registered email address
            console.log("OTP is sent to ---> ", adminDetails.adminEmail);

            return { message: `OTP is sent to ${adminDetails.adminEmail}` }; // for testing
        } catch (error) {
            if (error instanceof CustomError) throw error;
            throw new CustomError("An unexpected error occured while signing in!", 500);
        }
    }

    // (test passed)
    async adminVerification(otp) {
        if (!otp) throw new CustomError("Invalid otp - backend", 400);
        try {
            if (!this.adminDetails || typeof this.adminDetails !== 'object') throw new CustomError("All fields required! - backend", 400); // I don't think this is necessary since the validation is already done in the previous method
            if (otp !== this.otp) throw new CustomError("Wrong otp", 409);
            const hashPassword = await bcryt.hash(this.adminDetails.adminPassword, 10); // encrypt the password using bcryt

            const account = await AdminModel.create({ ...this.adminDetails, password: hashPassword }) // create an admin account with adminDetails(using admin model)

            if (!account) throw new CustomError("Account cannot be created! - backend", 500); // if the account cannot be created, throw an error

            // track the time of an account creation
            const timestamp = new Date().toLocaleString();

            const receiverInfo = {
                to: this.adminDetails.adminEmail,
                subject: "Successfull sign up!",
                text: `Thanks ${this.adminDetails.adminName} for choosing Innocent Restaurant. From Innocent Team.`
            }

            await this.mailer.setUp();
            await this.mailer.sentMail(receiverInfo.to, receiverInfo.subject, receiverInfo.text);

            return { message: "Account sign up successfull! - backend", verification: `Verified on ${timestamp}` };
        } catch (error) {
            if (error instanceof CustomError) throw error;
            throw new CustomError("An unexpected error occured while verifying an OTP - backend", 500);
        }
    }

    /**
     * 1. Checks for the adminDetails first (throws a custom error if the validation goes wrong)
     * 2. Find the account by comparing the stored property adminName with the req.body property, adminName (if true, return the account details along with the password)
     * 3. If the account is not found while comparing the adminNames, throws a custom error
     * 4. Since the stored password is encrypted, while comparing the password, the req.body has to be hashed
     * 5. If the password is wrong, throws another custom error
     * 6. Added a timestamp to track the time of an account signIn
     * 7. Finally, return the signedIn account's details along with the timstamp
     */
    async adminSignIn(adminDetails) {//{adminDetails} as req.body
        if (!adminDetails || typeof adminDetails !== 'object') {
            throw new CustomError("All fields required! - backend", 400);
        }
        try {
            // have to use .select("+password") since, 'select:false' in database
            const account = await AdminModel.findOne({ adminName: adminDetails.adminName }).select("+password");
            if (!account) throw new CustomError("Account does not exist! - backend", 404);

            // compare passwords(enterPassword, storedPassword)
            const comparePassword = await bcryt.compare(adminDetails.password, account.password);
            if (!comparePassword) throw new CustomError("IncorrectPassword! - backend", 409);

            // track the time of an account signIn
            const timestamp = new Date().toLocaleString();

            const message = `Signed in successfull, ${account.adminName}.`

            return { message, signInAt: timestamp }
        } catch (error) {
            if (error instanceof CustomError) throw error;
            throw new CustomError("An unexpected error occured while signing in - backend", 500);
        }
    }

    /**
     * 1. Validate the orderId first (throws a custom error if it goes wrong)
     * 2. Find and update the orderDetails using orderId, updates the default status with 'accepted'
     * 3. If the orderDetails is not found, throw a custom error
     * 4. Return the updated orderDetails
     */
    async adminAcceptOrder(orderId, admin) { // (test passed)
        try {
            if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) throw new CustomError("Invalid Id - backend", 400);

            // track the time of the order acception
            const timestamp = new Date().toLocaleString();

            // It is more conveniet to use {new:true} instead of await order.save() when using .findbyIdAndUpdate
            const order = await OrderDetails.findByIdAndUpdate(orderId,
                {
                    acceptedByAdmin: 'accepted',
                    orderDispatchedTime: timestamp,
                    orderDispatchedBy: admin
                },
                { new: true } // Return the updated document
            );

            const mailInfo = {
                to: order.orderEmail,
                subject: 'Order Accepted',
                text: `Thanks, ${order.orderName} for choosing us and ordering ${order.orderQuantity} ${order.orderProductName}. Please order again. From Innocent Team.`
            }

            await this.mailer.setUp();
            await this.mailer.sentMail(mailInfo.to, mailInfo.subject, mailInfo.text);

            return order;
        } catch (error) {
            if (error instanceof CustomError) throw error;
            throw new CustomError("An unexpected error occured while accepting an order - backend", 500);
        }
    }

    /**
     * 1. Validates the orderId first (throws a custom error if it goes wrong)
     * 2. Find the orderDetails and delete it using orderId
     * 3. If the orderDetails is not found, throws a custom error
     * 4. Returns the deletion message if the orderDetails deletion is successfull
     */
    async adminRejectOrder(orderId) {
        try {
            if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) throw new CustomError("Invalid Id", 400);

            const order = await OrderDetails.findByIdAndDelete(orderId); // Directly deletes the orderDetails from the database using orderId
            if (!order) throw new CustomError("Order not found!", 404);

            return { message: "Order rejected successfully." }; // Returns only the deletion message without the deleted orderDetails
        } catch (error) {
            if (error instanceof CustomError) throw error;
            throw new CustomError("An unexpected error occured while rejecting an order! - backend", 500);
        }
    }
}
