# SmartPark – Smart Parking System Simulation

A **Smart Parking System Simulation and Modelling Project** developed to demonstrate how a parking facility can manage vehicle entry, parking-space allocation, occupancy tracking, vehicle departure, and automated parking fare calculation.

The simulation provides a visual representation of a parking facility, allowing users to monitor parking bays, register incoming vehicles, track parking duration, and calculate the fare when vehicles leave.

## 1. System Overview

SmartPark simulates the operation of a parking facility through an interactive dashboard. It divides the parking area into dedicated sections for cars, bikes, and electric vehicles (EVs).

The system automatically assigns an available parking bay based on the vehicle type and updates the parking layout whenever a vehicle enters or exits.

### Main Components

- **Entry Gate:** Controls simulated vehicle entry and opens when an appropriate parking bay is available.
- **Parking Layout:** Displays the parking facility from a top-view perspective, showing available and occupied bays.
- **Vehicle Management:** Records vehicle registration numbers, vehicle types, assigned parking bays, and entry times.
- **Occupancy Monitoring:** Displays real-time parking occupancy.
- **Exit Gate:** Processes vehicle departures and releases occupied parking bays.
- **Fare Calculation:** Calculates parking charges based on vehicle type and parking duration.
- **Transaction History:** Maintains a record of completed parking transactions.
- **Revenue Monitoring:** Displays the total revenue generated from completed parking transactions.

## 2. Parking Facility Model

The simulated parking facility consists of **12 parking bays**, divided into three sections:

| Vehicle Type | Bay IDs | Capacity |
|---|---|---:|
| Car | C1 – C6 | 6 |
| Bike | K1 – K4 | 4 |
| Electric Vehicle (EV) | E1 – E2 | 2 |
| **Total** | | **12** |

Each vehicle type has a dedicated parking section. When a vehicle arrives, the system searches for an available bay in its corresponding section and assigns one randomly.

If all bays in a particular section are occupied, the entry is denied until a bay becomes available.

## 3. System Working Mechanism

The simulation follows these steps:

### Step 1: Vehicle Arrival

- Enter the vehicle registration number.
- Select the vehicle type (Car, Bike, or EV).
- Submit the arrival form.
- The system checks the availability of a suitable parking bay.

### Step 2: Parking Bay Allocation

- An available bay is selected from the corresponding vehicle section.
- The vehicle registration number and entry timestamp are recorded.
- The entry gate opens temporarily.
- The parking layout updates to indicate the occupied bay.
- The dashboard displays the assigned bay.

### Step 3: Occupancy Monitoring

The dashboard dynamically displays:

- Total parking capacity.
- Number of occupied bays.
- Available parking spaces.
- Active parked vehicles.
- Assigned parking bay for each vehicle.
- Parking duration, updated every second.

### Step 4: Vehicle Departure

- Select a vehicle from the active vehicle list.
- Initiate the exit process.
- The system retrieves its entry timestamp and records the exit timestamp.
- Parking duration is calculated.
- The applicable parking fare is generated.
- The exit gate opens.
- The previously occupied parking bay is released and marked as available.

### Step 5: Fare Generation and Transaction Recording

After the vehicle exits, the system generates a receipt containing:

- Vehicle registration number.
- Vehicle type.
- Assigned parking bay.
- Entry time.
- Exit time.
- Total parking duration.
- Parking fare.

The completed transaction is also added to the transaction history, and the revenue counter is updated.

## 4. Parking Fare Calculation Model

The parking fare depends on the vehicle type and total parking duration.

The simulation uses a **5-minute grace period**, during which no parking fee is charged.

### Parking Rate Configuration

| Vehicle Type | First Hour | Each Additional Hour |
|---|---:|---:|
| Car | ₹30 | ₹20 |
| Bike | ₹10 | ₹5 |
| EV | ₹40 | ₹25 |

### Fare Calculation Logic

Let:

- `T` = Total parking duration in minutes.
- `B` = Base fare for the first billed hour.
- `R` = Additional hourly rate.

**Grace Period:**

If:

\[
T \leq 5
\]

Then:

\[
Fare = 0
\]

**After the Grace Period:**

The number of billed hours is rounded up to the next complete hour:

\[
H = \max(1,\lceil T/60 \rceil)
\]

The total parking fare is:

\[
\boxed{Fare = B + (H-1)\times R}
\]

### Example Calculation

Consider a car parked for 2 hours and 20 minutes.

- First hour charge = ₹30
- Additional billed hours = 2 - 1 = 1
- Additional charge = ₹20

Therefore:

\[
Total\ Fare = 30 + (1 \times 20)
\]

\[
\boxed{Total\ Fare = ₹50}
\]

The same billing logic is applied to cars, bikes, and EVs using their respective rates.

## 5. Simulation Features

| Feature | Description |
|---|---|
| Vehicle Registration | Records vehicle number plates and types |
| Automatic Bay Allocation | Assigns available bays based on vehicle type |
| Parking Visualization | Displays free and occupied parking bays |
| Gate Simulation | Simulates entry and exit barrier operations |
| Live Duration Tracking | Updates parking duration every second |
| Fare Calculation | Calculates charges based on parking duration |
| Exit Receipt | Generates a parking receipt |
| Transaction Log | Displays completed parking transactions |
| Revenue Tracking | Calculates accumulated parking revenue |
| Random Parking Demo | Simulates vehicle arrivals automatically |

## 6. Technologies Used

- **HTML5** – Structure of the simulation dashboard.
- **CSS3** – Dashboard styling, parking layout, and visual elements.
- **JavaScript** – Parking allocation, vehicle management, gate operations, time tracking, and fare calculation.

## 7. Project Structure

```text
snm_pjt/
│
├── index.html       # Main dashboard and interface
├── style.css        # Styling and parking visualization
├── script.js        # Simulation logic and fare calculation
└── README.md        # Project documentation
