import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import org.linlinjava.litemall.core.util.bcrypt.BCrypt;

/** Development bootstrap only. Credentials come from the ignored local environment. */
public class BaselineAdmin {
    public static void main(String[] args) throws Exception {
        String password = System.getenv("BASELINE_ADMIN_PASSWORD");
        String username = System.getenv("BASELINE_ADMIN_USER");
        if (password == null || password.length() < 16 || username == null)
            throw new IllegalArgumentException("Missing baseline credentials");
        String url = "jdbc:mysql://mysql:3306/litemall_baseline?allowPublicKeyRetrieval=true&useSSL=false&serverTimezone=Asia/Shanghai";
        try (Connection db = DriverManager.getConnection(url, "litemall", System.getenv("MYSQL_PASSWORD"))) {
            // Initialize once; subsequent starts preserve password/account changes made in the UI.
            db.createStatement().execute("CREATE TABLE IF NOT EXISTS baseline_initialized (id INT PRIMARY KEY)");
            try (ResultSet rows = db.createStatement().executeQuery("SELECT id FROM baseline_initialized WHERE id=1")) {
                if (rows.next()) return;
            }
            db.setAutoCommit(false);
            try (PreparedStatement reset = db.prepareStatement("UPDATE litemall_admin SET password=?")) {
                reset.setString(1, BCrypt.hashpw(password, BCrypt.gensalt()));
                reset.executeUpdate();
            }
            try (PreparedStatement admin = db.prepareStatement("UPDATE litemall_admin SET username=? WHERE id=1")) {
                admin.setString(1, username);
                admin.executeUpdate();
            }
            db.createStatement().executeUpdate("INSERT INTO baseline_initialized VALUES (1)");
            // Use the upstream configuration switch; no real WeChat account in this baseline.
            db.createStatement().executeUpdate("UPDATE litemall_system SET key_value='false' WHERE key_name='litemall_wx_share'");
            db.commit();
        }
        System.out.println("Baseline administrator initialized (credentials not logged).");
    }
}
