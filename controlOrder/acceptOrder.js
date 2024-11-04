import OrderService from "./OrderServerice.js";

export const acceptOrder = async(req, res) => {
    const {id} = req.params;
    const orderService = new OrderService();
    try {
        const response = await orderService.acceptOrder(id);
        // show the client about the dispatch time
        const timestamp = new Date().toLocaleString();

        // return the response along with the order time and the dispatched time
        return res.status(200).json({
            message:"Order has been dispatched! - backend",
            response,
            dispatchTime:timestamp
        })
    } catch (error) {
        if(error instanceof CustomError) {
            res.status(error.errorCode).json({message:error.message});
        }
        res.status(500).json({message:"Internal server error - backend"})
    }
}
